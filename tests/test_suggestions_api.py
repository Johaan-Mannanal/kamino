import base64
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from io import BytesIO
from threading import Event
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.contracts import AssetProperties, JobRecord

SECRET = "gemini-test-secret"


def seed(tmp_path):
    store = JobStore(tmp_path)
    job_id = uuid4()
    image = store.job_dir(job_id) / "uploads/view.png"
    image.parent.mkdir(parents=True)
    Image.new("RGB", (2400, 1200), "white").save(image)
    now = datetime.now(UTC)
    store.create(
        JobRecord(
            id=job_id,
            status="awaiting_properties",
            provider="mock",
            synthetic=True,
            created_at=now,
            updated_at=now,
            source_images=["uploads/view.png"],
            properties=AssetProperties(
                dimensions_m={"x": 0.04, "y": 0.05, "z": 0.06, "source": "measured"},
                mass_kg={"value": 0.09, "source": "user_supplied"},
            ),
        )
    )
    return job_id, store, image


def good_response():
    data = {
        "dimensions_m": {"x": 0.043, "y": 0.027, "z": 0.058},
        "mass_kg": 0.059,
        "sliding_friction": None,
        "notes": ["Uncertain scale"],
    }
    return httpx.Response(
        200,
        json={
            "candidates": [
                {
                    "finishReason": "STOP",
                    "content": {"parts": [{"text": json.dumps(data)}]},
                }
            ]
        },
    )


def test_explicit_suggestions_are_estimated_cached_and_never_confirm_properties(tmp_path):
    job_id, store, image = seed(tmp_path)
    before_job = store.get(job_id)
    before_image = image.read_bytes()
    calls = []

    def transport(request):
        assert request.headers["x-goog-api-key"] == SECRET
        assert "/models/test-flash:generateContent" in str(request.url)
        body = json.loads(request.content)
        encoded = body["contents"][0]["parts"][1]["inline_data"]
        assert encoded["mime_type"] == "image/jpeg"
        with Image.open(BytesIO(base64.b64decode(encoded["data"]))) as copied:
            assert copied.size == (1024, 512)
        calls.append(body)
        return good_response()

    settings = Settings(data_dir=tmp_path, gemini_api_key=SECRET, gemini_model="test-flash")
    with TestClient(create_app(settings, gemini_transport=transport)) as client:
        assert client.get(f"/api/jobs/{job_id}/suggestions").status_code == 404
        result = client.post(f"/api/jobs/{job_id}/suggestions", json={"object_hint": "charger"})
        assert result.status_code == 200, result.text
        values = result.json()
        assert values["dimensions_m"]["source"] == "estimated"
        assert values["mass_kg"]["source"] == "estimated"
        assert values["sliding_friction"] is None
        assert values["clarifying_questions"]
        assert SECRET not in result.text
        assert client.get(f"/api/jobs/{job_id}/suggestions").json() == values
        assert (
            client.post(f"/api/jobs/{job_id}/suggestions", json={"object_hint": "charger"}).json()
            == values
        )
        assert len(calls) == 1
        assert (
            client.post(
                f"/api/jobs/{job_id}/suggestions", json={"object_hint": "charger", "refresh": True}
            ).status_code
            == 200
        )
        assert len(calls) == 2
        assert (
            client.post(
                f"/api/jobs/{job_id}/suggestions", json={"object_hint": "different object"}
            ).status_code
            == 200
        )
        assert len(calls) == 3
        assert store.get(job_id) == before_job
        assert image.read_bytes() == before_image
    with TestClient(create_app(settings, gemini_transport=transport)) as client:
        assert client.get(f"/api/jobs/{job_id}/suggestions").json() == values
        assert len(calls) == 3


@pytest.mark.parametrize("failure", ["missing_key", "quota", "invalid_json", "exception"])
def test_assistance_failures_leave_manual_entry_and_existing_job_untouched(tmp_path, failure):
    job_id, store, _ = seed(tmp_path)
    before = store.get(job_id)

    def transport(request):
        if failure == "quota":
            return httpx.Response(429, text="secret-key-123 private provider details")
        if failure == "invalid_json":
            return httpx.Response(200, json={"candidates": []})
        raise RuntimeError("secret-key-123 private provider details")

    settings = Settings(
        data_dir=tmp_path, gemini_api_key="" if failure == "missing_key" else SECRET
    )
    with TestClient(create_app(settings, gemini_transport=transport)) as client:
        result = client.post(f"/api/jobs/{job_id}/suggestions", json={})
        assert result.status_code == 503
        assert "secret-key" not in result.text
        assert store.get(job_id) == before
        assert client.get(f"/api/jobs/{job_id}/suggestions").status_code == 404
        assert (
            client.patch(
                f"/api/jobs/{job_id}/properties", json=before.properties.model_dump(mode="json")
            ).status_code
            == 200
        )


def test_missing_jobs_bad_hints_and_escaped_images_never_call_gemini(tmp_path):
    job_id, store, _ = seed(tmp_path)
    calls = []

    def transport(request):
        calls.append(request)
        return good_response()

    with TestClient(
        create_app(Settings(data_dir=tmp_path, gemini_api_key=SECRET), gemini_transport=transport)
    ) as client:
        assert client.post(f"/api/jobs/{uuid4()}/suggestions", json={}).status_code == 404
        assert (
            client.post(
                f"/api/jobs/{job_id}/suggestions", json={"object_hint": "x" * 2001}
            ).status_code
            == 422
        )
        outside = tmp_path / "private.png"
        Image.new("RGB", (8, 8)).save(outside)
        store.update(job_id, source_images=["../private.png"])
        assert client.post(f"/api/jobs/{job_id}/suggestions", json={}).status_code == 422
        assert not calls


def test_concurrent_requests_do_not_duplicate_provider_calls(tmp_path):
    job_id, _, _ = seed(tmp_path)
    entered, release = Event(), Event()
    calls = []

    def transport(request):
        calls.append(request)
        entered.set()
        assert release.wait(10)
        return good_response()

    with TestClient(
        create_app(Settings(data_dir=tmp_path, gemini_api_key=SECRET), gemini_transport=transport)
    ) as client:
        with ThreadPoolExecutor(max_workers=1) as executor:
            first = executor.submit(client.post, f"/api/jobs/{job_id}/suggestions", json={})
            try:
                assert entered.wait(5)
                assert client.post(f"/api/jobs/{job_id}/suggestions", json={}).status_code == 429
            finally:
                release.set()
            assert first.result().status_code == 200
        assert client.post(f"/api/jobs/{job_id}/suggestions", json={}).status_code == 200
        assert len(calls) == 1


def test_request_rechecks_cache_after_waiting_to_acquire_slot(tmp_path, monkeypatch):
    from photo2sim.api.suggestions import SuggestionService

    job_id, _, _ = seed(tmp_path)
    entered, release_first, stale_read, resume_second = Event(), Event(), Event(), Event()
    calls = []
    original_cached = SuggestionService.cached

    def cached_with_delayed_return(self, requested_id):
        result = original_cached(self, requested_id)
        if entered.is_set() and not stale_read.is_set():
            stale_read.set()
            assert resume_second.wait(10)
        return result

    def transport(request):
        calls.append(request)
        if len(calls) == 1:
            entered.set()
            assert release_first.wait(10)
        return good_response()

    monkeypatch.setattr(SuggestionService, "cached", cached_with_delayed_return)
    with TestClient(
        create_app(Settings(data_dir=tmp_path, gemini_api_key=SECRET), gemini_transport=transport)
    ) as client:
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(client.post, f"/api/jobs/{job_id}/suggestions", json={})
            second = None
            try:
                assert entered.wait(5)
                second = executor.submit(client.post, f"/api/jobs/{job_id}/suggestions", json={})
                assert stale_read.wait(5)
                release_first.set()
                assert first.result(timeout=5).status_code == 200
                resume_second.set()
                assert second.result(timeout=5).status_code == 200
            finally:
                release_first.set()
                resume_second.set()
        assert len(calls) == 1
