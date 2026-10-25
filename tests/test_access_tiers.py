from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings


def settings(path, **changes):
    return Settings(
        data_dir=path,
        api_token="original-test-secret",
        student_code="friend-test-code",
        judge_code="judge-test-code",
        team_code="team-test-code",
        **changes,
    )


def sign_in(client, code):
    return client.post("/api/session", headers={"Authorization": f"Bearer {code}"})


@pytest.mark.parametrize(
    "code,role,seconds",
    [
        ("friend-test-code", "student", 1800),
        ("judge-test-code", "judge", 21600),
        ("team-test-code", "team", 43200),
        ("original-test-secret", "team", 43200),
    ],
)
def test_each_code_has_its_own_signed_role_and_session_duration(tmp_path, code, role, seconds):
    with TestClient(create_app(settings(tmp_path)), base_url="https://kamino.test") as client:
        response = sign_in(client, code)
        assert response.status_code == 200
        assert response.json()["role"] == role
        assert response.json()["session_seconds"] == seconds
        assert f"Max-Age={seconds}" in response.headers["set-cookie"]
        assert code not in response.text + response.headers["set-cookie"]
        assert client.get("/api/session").json()["role"] == role
        assert client.get(f"/api/assembly-jobs/{uuid4()}").status_code == 404


def test_tier_cookie_cannot_be_promoted_and_rotating_code_revokes_it(tmp_path):
    with TestClient(create_app(settings(tmp_path)), base_url="https://kamino.test") as client:
        sign_in(client, "friend-test-code")
        cookie = dict(client.cookies)["kamino_session"]
        assert "student" in cookie
        client.cookies.clear()
        client.cookies.set("kamino_session", cookie.replace("student", "team"))
        assert client.get(f"/api/jobs/{uuid4()}").status_code == 401
    config = settings(tmp_path)
    from dataclasses import replace

    with TestClient(
        create_app(replace(config, student_code="changed")), base_url="https://kamino.test"
    ) as client:
        assert (
            client.get(
                f"/api/jobs/{uuid4()}", headers={"Cookie": f"kamino_session={cookie}"}
            ).status_code
            == 401
        )


def test_friend_expiry_is_enforced_by_server(tmp_path, monkeypatch):
    import time

    now = time.time()
    with TestClient(create_app(settings(tmp_path)), base_url="https://kamino.test") as client:
        sign_in(client, "friend-test-code")
        cookie = dict(client.cookies)["kamino_session"]
        monkeypatch.setattr(time, "time", lambda: now + 1801)
        assert (
            client.get(
                f"/api/jobs/{uuid4()}", headers={"Cookie": f"kamino_session={cookie}"}
            ).status_code
            == 401
        )


def upload(client):
    data = BytesIO()
    Image.new("RGB", (4, 4), "blue").save(data, format="PNG")
    return client.post(
        "/api/jobs",
        files={"images": ("test.png", data.getvalue(), "image/png")},
        headers={"Origin": "https://kamino.test"},
    )


def test_mesh_quota_survives_signin_restart_and_bearer_access(tmp_path, monkeypatch):
    import time

    now = time.time()
    with TestClient(create_app(settings(tmp_path)), base_url="https://kamino.test") as client:
        sign_in(client, "friend-test-code")
        assert upload(client).status_code == 202
        response = upload(client)
        assert response.status_code == 429
        assert int(response.headers["retry-after"]) > 0
        monkeypatch.setattr(time, "time", lambda: now + 301)
        assert upload(client).status_code == 202
    monkeypatch.setattr(time, "time", lambda: now + 602)
    with TestClient(create_app(settings(tmp_path)), base_url="https://kamino.test") as client:
        sign_in(client, "friend-test-code")
        assert upload(client).status_code == 429
        client.cookies.clear()
        client.headers["Authorization"] = "Bearer friend-test-code"
        assert upload(client).status_code == 429
        client.headers["Authorization"] = "Bearer original-test-secret"
        assert upload(client).status_code == 202


def test_invalid_uploads_do_not_consume_quota_and_cookie_csrf_remains_blocked(tmp_path):
    with TestClient(create_app(settings(tmp_path)), base_url="https://kamino.test") as client:
        sign_in(client, "friend-test-code")
        assert client.post("/api/jobs", headers={"Origin": "https://evil.test"}).status_code == 403
        for _ in range(3):
            assert (
                client.post("/api/jobs", headers={"Origin": "https://kamino.test"}).status_code
                == 422
            )
        assert upload(client).status_code == 202


def test_atomic_quota_cannot_be_exceeded_by_parallel_requests(tmp_path):
    from photo2sim.api.access_limits import AccessLimits

    limits = AccessLimits(tmp_path)

    def attempt(_):
        try:
            return limits.reserve("student", "mesh") is not None
        except Exception as error:
            assert getattr(error, "status_code", None) == 429
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(attempt, range(8))) == 1


def test_daily_limits_cooldowns_and_reset_are_separate_by_tier_and_action(tmp_path, monkeypatch):
    import time

    from photo2sim.api.access_limits import AccessLimits

    now = time.time()
    limits = AccessLimits(tmp_path)
    for index in range(10):
        monkeypatch.setattr(time, "time", lambda: now + index * 31)
        limits.reserve("student", "gemini")
    monkeypatch.setattr(time, "time", lambda: now + 310)
    with pytest.raises(Exception) as error:
        limits.reserve("student", "gemini")
    assert error.value.status_code == 429
    limits.reserve("judge", "gemini")
    limits.reserve("student", "mesh")
    for _ in range(50):
        assert limits.reserve("team", "mesh") is None
    monkeypatch.setattr(time, "time", lambda: now + 86401)
    limits.reserve("student", "gemini")


def test_codes_require_secret_and_are_not_exposed_in_settings(tmp_path):
    config = settings(tmp_path)
    assert "friend-test-code" not in repr(config)
    with pytest.raises(ValueError):
        Settings(api_token="", student_code="test")
    with pytest.raises(ValueError):
        Settings(api_token="test", student_code="test")


def test_tier_codes_load_from_environment_without_repr_disclosure(tmp_path, monkeypatch):
    monkeypatch.setenv("PHOTO2SIM_API_TOKEN", "test-original")
    monkeypatch.setenv("PHOTO2SIM_STUDENT_CODE", "test-friend")
    monkeypatch.setenv("PHOTO2SIM_JUDGE_CODE", "test-judge")
    monkeypatch.setenv("PHOTO2SIM_TEAM_CODE", "test-team")
    config = Settings.from_env(env_file=None)
    assert (config.student_code, config.judge_code, config.team_code) == (
        "test-friend",
        "test-judge",
        "test-team",
    )
    assert all(
        value not in repr(config)
        for value in (config.student_code, config.judge_code, config.team_code)
    )


def test_gemini_requests_are_limited_but_saved_reads_remain_available(tmp_path):
    with TestClient(create_app(settings(tmp_path)), base_url="https://kamino.test") as client:
        sign_in(client, "friend-test-code")
        job = upload(client).json()["id"]
        # No configured key: a provider-unavailable response conservatively consumes
        # admission, so retries cannot bypass the limit after a possible paid call.
        url = f"/api/jobs/{job}/suggestions"
        assert client.post(url, headers={"Origin": "https://kamino.test"}).status_code == 503
        assert client.post(url, headers={"Origin": "https://kamino.test"}).status_code == 429
        assert client.get(f"/api/jobs/{job}").status_code == 200
        assert client.get(url).status_code == 404


@pytest.mark.parametrize(
    "role,action,count,gap",
    [
        ("judge", "mesh", 10, 31),
        ("judge", "gemini", 40, 6),
        ("judge", "simulation", 50, 6),
        ("student", "simulation", 10, 31),
    ],
)
def test_remaining_daily_budgets_are_enforced(tmp_path, monkeypatch, role, action, count, gap):
    import time

    from photo2sim.api.access_limits import AccessLimits

    now = time.time()
    limits = AccessLimits(tmp_path)
    for index in range(count):
        monkeypatch.setattr(time, "time", lambda: now + index * gap)
        limits.reserve(role, action)
    monkeypatch.setattr(time, "time", lambda: now + count * gap)
    with pytest.raises(Exception) as error:
        limits.reserve(role, action)
    assert error.value.status_code == 429


def test_assembly_paths_and_trailing_slashes_cannot_bypass_admission():
    from photo2sim.api.access_limits import request_action

    assert request_action("POST", "/api/jobs/") == "mesh"
    assert request_action("POST", "/api/assembly-jobs") == "simulation"
    assert request_action("POST", "/api/assembly-jobs/from-meshes") == "simulation"
    assert request_action("POST", f"/api/assembly-jobs/{uuid4()}/process") == "simulation"
    assert request_action("GET", f"/api/jobs/{uuid4()}/suggestions") is None


def test_failed_cache_write_after_gemini_does_not_refund_provider_allowance(tmp_path, monkeypatch):
    from pathlib import Path

    import httpx
    from test_gemini import GOOD, envelope

    calls = []

    def transport(request):
        calls.append(request)
        return httpx.Response(200, json=envelope(GOOD))

    original = Path.write_text

    def fail_cache(path, *args, **kwargs):
        if path.name == "gemini.json.partial":
            raise OSError("Test cache storage failure after inference")
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "write_text", fail_cache)
    app = create_app(settings(tmp_path, gemini_api_key="test-only-key"), gemini_transport=transport)
    with TestClient(app, base_url="https://kamino.test") as client:
        sign_in(client, "friend-test-code")
        job = upload(client).json()["id"]
        url = f"/api/jobs/{job}/suggestions"
        assert client.post(url, headers={"Origin": "https://kamino.test"}).status_code == 422
        assert len(calls) == 1
        assert client.post(url, headers={"Origin": "https://kamino.test"}).status_code == 429
        assert len(calls) == 1
