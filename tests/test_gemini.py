import base64
import json
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError

from photo2sim.contracts import Dimensions, ScalarProperty
from photo2sim.integrations.gemini import (
    DEFAULT_MODEL,
    SUGGESTION_NOTE,
    GeminiUnavailable,
    PropertySuggestions,
    suggest_properties,
)

SECRET = "test-secret-never-echo"
GOOD = {
    "dimensions_m": {"x": 0.04, "y": 0.05, "z": 0.06},
    "mass_kg": 0.08,
    "sliding_friction": 0.4,
    "clarifying_questions": ["Which surface will it touch?"],
    "notes": ["Scale is uncertain."],
}


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)


@pytest.fixture
def images(tmp_path):
    path = tmp_path / "view.png"
    path.write_bytes(b"verified-upload-bytes")
    return [path]


def envelope(data):
    return {
        "candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": json.dumps(data)}]}}]
    }


def reply(data):
    return lambda request: httpx.Response(200, json=envelope(data))


def test_happy_path_sends_images_and_json_request(images):
    def handle(request):
        assert request.method == "POST"
        assert str(request.url) == (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{DEFAULT_MODEL}:generateContent"
        )
        assert request.headers["x-goog-api-key"] == SECRET
        assert SECRET not in str(request.url)
        body = json.loads(request.content)
        assert body["generationConfig"]["response_mime_type"] == "application/json"
        parts = body["contents"][0]["parts"]
        assert "ceramic cup" in parts[0]["text"]
        assert "full extents in metres" in parts[0]["text"]
        assert parts[1]["inline_data"]["mime_type"] == "image/png"
        assert base64.b64decode(parts[1]["inline_data"]["data"]) == images[0].read_bytes()
        return httpx.Response(200, json=envelope(GOOD))

    result = suggest_properties(images, "ceramic cup", api_key=SECRET, transport=handle)
    assert isinstance(result.dimensions_m, Dimensions)
    assert result.dimensions_m.x == 0.04
    assert result.dimensions_m.y == 0.05
    assert result.dimensions_m.z == 0.06
    assert isinstance(result.mass_kg, ScalarProperty)
    assert result.mass_kg.value == 0.08
    assert result.sliding_friction.value == 0.4
    assert result.clarifying_questions == GOOD["clarifying_questions"]
    assert "Scale is uncertain." in result.notes


@pytest.mark.parametrize("claimed_source", ["measured", "user_supplied", "sourced", "invented"])
def test_model_provenance_is_always_overwritten(images, claimed_source):
    data = {
        **GOOD,
        "dimensions_m": {**GOOD["dimensions_m"], "source": claimed_source, "note": "verified"},
        "mass_kg": {"value": 0.08, "source": claimed_source, "note": "verified"},
        "sliding_friction": {"value": 0.4, "source": claimed_source},
    }
    result = suggest_properties(images, api_key=SECRET, transport=reply(data))
    for prop in (result.dimensions_m, result.mass_kg, result.sliding_friction):
        assert prop.source == "estimated"
        assert prop.note == SUGGESTION_NOTE


@pytest.mark.parametrize(
    "bad", [None, 0, -1, float("nan"), float("inf"), -float("inf"), True, "0.4", [], {}]
)
def test_invalid_numeric_values_become_questions(images, bad):
    data = {
        **GOOD,
        "dimensions_m": {"x": bad, "y": 0.05, "z": 0.06},
        "mass_kg": bad,
        "sliding_friction": bad,
    }
    result = suggest_properties(images, api_key=SECRET, transport=reply(data))
    assert result.dimensions_m is None
    assert result.mass_kg is None
    assert result.sliding_friction is None
    questions = " ".join(result.clarifying_questions)
    assert "x extent" in questions
    assert "mass" in questions
    assert "contacting surfaces" in questions


def test_missing_values_are_not_filled_and_bad_text_fields_are_filtered(images):
    result = suggest_properties(
        images,
        api_key=SECRET,
        transport=reply(
            {"clarifying_questions": [None, 123, "  Is it hollow?  ", ""], "notes": 42}
        ),
    )
    assert result.dimensions_m is result.mass_kg is result.sliding_friction is None
    assert len(result.clarifying_questions) == 6
    assert result.clarifying_questions[0] == "Is it hollow?"
    assert result.notes == [SUGGESTION_NOTE]


def test_partial_bad_dimensions_preserve_other_properties(images):
    result = suggest_properties(
        images, api_key=SECRET, transport=reply({**GOOD, "dimensions_m": {"x": 0.1, "y": 0.2}})
    )
    assert result.dimensions_m is None
    assert result.mass_kg.value == 0.08
    assert any("z extent" in question for question in result.clarifying_questions)


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b"[]",
        b"{}",
        json.dumps(envelope([])).encode(),
        json.dumps({"candidates": [{"content": {"parts": [{"text": "{broken"}]}}]}).encode(),
        json.dumps({"candidates": [{"finishReason": "STOP", "content": None}]}).encode(),
        json.dumps(
            {"candidates": [{"finishReason": "STOP", "content": {"parts": [None]}}]}
        ).encode(),
        json.dumps({"candidates": [{"finishReason": "MAX_TOKENS"}]}).encode(),
        json.dumps({"promptFeedback": {"blockReason": "SAFETY"}}).encode(),
    ],
)
def test_malformed_or_incomplete_responses_are_unavailable(images, body):
    with pytest.raises(GeminiUnavailable):
        suggest_properties(
            images, api_key=SECRET, transport=lambda request: httpx.Response(200, content=body)
        )


def test_malformed_candidate_json_is_unavailable(images):
    data = envelope(GOOD)
    data["candidates"][0]["content"]["parts"][0]["text"] = "{broken " + SECRET
    with pytest.raises(GeminiUnavailable) as error:
        suggest_properties(
            images, api_key=SECRET, transport=lambda request: httpx.Response(200, json=data)
        )
    assert SECRET not in str(error.value)
    assert SECRET not in repr(error.value)


@pytest.mark.parametrize("key", [None, "", "  "])
def test_missing_key_never_calls_transport(images, key):
    def unexpected(request):
        pytest.fail("Missing credentials must not make a request")

    with pytest.raises(GeminiUnavailable, match="GEMINI_API_KEY"):
        suggest_properties(images, api_key=key, transport=unexpected)


@pytest.mark.parametrize("status", [400, 401, 402, 403, 404, 429, 500, 503])
def test_http_failures_are_safe_unavailable_errors_without_retries(images, status):
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(status, json={"error": SECRET})

    with pytest.raises(GeminiUnavailable) as error:
        suggest_properties(images, api_key=SECRET, transport=handle)
    assert str(status) in str(error.value)
    assert SECRET not in str(error.value)
    assert SECRET not in repr(error.value)
    assert error.value.__suppress_context__
    assert len(calls) == 1


def test_network_error_is_safe(images):
    def handle(request):
        raise httpx.ReadTimeout(SECRET, request=request)

    with pytest.raises(GeminiUnavailable) as error:
        suggest_properties(images, api_key=SECRET, transport=handle)
    assert SECRET not in str(error.value)
    assert SECRET not in repr(error.value)


def test_environment_and_explicit_overrides(images, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "env-key")
    monkeypatch.setenv("GEMINI_MODEL", "env-model")
    seen = []

    def handle(request):
        seen.append((request.headers["x-goog-api-key"], request.url.path))
        return httpx.Response(200, json=envelope(GOOD))

    suggest_properties(images, transport=httpx.MockTransport(handle))
    suggest_properties(images, api_key="explicit-key", model="explicit-model", transport=handle)
    assert seen == [
        ("env-key", "/v1beta/models/env-model:generateContent"),
        ("explicit-key", "/v1beta/models/explicit-model:generateContent"),
    ]


def test_property_suggestions_forbid_extras_and_enforce_provenance():
    with pytest.raises(ValidationError):
        PropertySuggestions(confirmed=True)
    result = PropertySuggestions(
        mass_kg=ScalarProperty(value=1, source="measured", note="verified")
    )
    assert result.mass_kg.source == "estimated"
    assert result.mass_kg.note == SUGGESTION_NOTE


def test_multiple_response_parts_are_joined(images):
    text = json.dumps(GOOD)
    data = envelope(GOOD)
    data["candidates"][0]["content"]["parts"] = [
        {"text": "Private reasoning", "thought": True},
        {"text": text[:20]},
        {"text": text[20:]},
    ]
    result = suggest_properties(
        images, api_key=SECRET, transport=lambda request: httpx.Response(200, json=data)
    )
    assert result.mass_kg.value == 0.08


@pytest.mark.parametrize("case", ["empty", "missing", "directory", "unsupported", "null-byte"])
def test_invalid_local_images_never_call_transport(tmp_path, case):
    path = tmp_path / "view.png"
    if case == "empty":
        path.write_bytes(b"")
    elif case == "directory":
        path.mkdir()
    elif case == "unsupported":
        path = tmp_path / "view.svg"
        path.write_bytes(b"not an accepted image")
    elif case == "null-byte":
        path = Path("private\x00.png")

    def unexpected(request):
        pytest.fail("Invalid local images must not make a request")

    with pytest.raises(ValueError) as error:
        suggest_properties([path], api_key=SECRET, transport=unexpected)
    assert str(path) not in str(error.value)
    assert SECRET not in str(error.value)


@pytest.mark.parametrize("count", [0, 5])
def test_invalid_image_counts_never_call_transport(images, count):
    def unexpected(request):
        pytest.fail("Invalid image counts must not make a request")

    with pytest.raises(ValueError, match="one to four"):
        suggest_properties(images * count, api_key=SECRET, transport=unexpected)


@pytest.mark.parametrize("model", ["models/example", "https://example.com", "bad?key=" + SECRET])
def test_model_paths_and_urls_are_rejected_safely(images, model):
    def unexpected(request):
        pytest.fail("Invalid model IDs must not make a request")

    with pytest.raises(ValueError) as error:
        suggest_properties(images, api_key=SECRET, model=model, transport=unexpected)
    assert model not in str(error.value)
    assert SECRET not in str(error.value)


def test_direct_dimensions_cannot_claim_confirmed_provenance():
    original = Dimensions(x=1, y=2, z=3, source="measured", note="verified")
    result = PropertySuggestions(dimensions_m=original)
    assert result.dimensions_m.source == "estimated"
    assert result.dimensions_m.note == SUGGESTION_NOTE
    assert original.source == "measured"
    assert original.note == "verified"
