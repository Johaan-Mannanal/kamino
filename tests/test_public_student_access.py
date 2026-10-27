from dataclasses import replace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from test_access_tiers import settings, sign_in, upload

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings


def test_public_student_access_requires_explicit_server_opt_in(tmp_path):
    with TestClient(create_app(settings(tmp_path)), base_url="https://kamino.test") as client:
        assert not client.get("/api/session").json().get("public_student_access")
        assert (
            client.post("/api/session", headers={"Origin": "https://kamino.test"}).status_code
            == 401
        )
    with pytest.raises(ValueError):
        Settings(public_student_access=True)
    with pytest.raises(ValueError):
        Settings(api_token="secret", public_student_access=True)


def test_public_session_is_student_only_secure_and_not_created_by_get(tmp_path):
    config = settings(tmp_path, public_student_access=True)
    with TestClient(create_app(config), base_url="https://kamino.test") as client:
        status = client.get("/api/session")
        assert status.json()["public_student_access"] is True
        assert status.json()["authenticated"] is False
        assert "set-cookie" not in status.headers
        response = client.post("/api/session", headers={"Origin": "https://kamino.test"})
        assert response.status_code == 200
        assert response.json()["role"] == "student"
        assert response.json()["session_seconds"] == 1800
        cookie = response.headers["set-cookie"]
        assert all(
            value in cookie
            for value in ["Secure", "HttpOnly", "SameSite=strict", "Path=/api", "Max-Age=1800"]
        )
        assert config.student_code not in response.text + cookie
        assert config.api_token not in response.text + cookie
        assert client.get(f"/api/jobs/{uuid4()}").status_code == 404
        assert "set-cookie" not in client.get("/api/session").headers
        assert client.post("/api/jobs", headers={"Origin": "https://evil.test"}).status_code == 403


@pytest.mark.parametrize("origin", [None, "null", "https://evil.test"])
def test_public_session_requires_a_trusted_browser_origin(tmp_path, origin):
    with TestClient(
        create_app(settings(tmp_path, public_student_access=True)), base_url="https://kamino.test"
    ) as client:
        response = client.post("/api/session", headers={"Origin": origin} if origin else {})
        assert response.status_code == 403
        assert "set-cookie" not in response.headers


def test_public_session_does_not_rescue_bad_credentials_or_downgrade_a_judge(tmp_path, monkeypatch):
    import time

    now = time.time()
    with TestClient(
        create_app(settings(tmp_path, public_student_access=True)), base_url="https://kamino.test"
    ) as client:
        sign_in(client, "judge-test-code")
        response = client.post("/api/session", headers={"Origin": "https://kamino.test"})
        assert response.json()["role"] == "judge"
        assert response.json()["session_seconds"] == 21600
        assert "set-cookie" not in response.headers
        rejected = client.post(
            "/api/session",
            headers={"Origin": "https://kamino.test", "Authorization": "Bearer wrong"},
        )
        assert rejected.status_code == 401
        assert "set-cookie" not in rejected.headers
        assert client.get("/api/session").json()["role"] == "judge"
        monkeypatch.setattr(time, "time", lambda: now + 21540)
        assert (
            "set-cookie"
            not in client.post("/api/session", headers={"Origin": "https://kamino.test"}).headers
        )
        monkeypatch.setattr(time, "time", lambda: now + 21660)
        assert not client.get("/api/session").json()["authenticated"]
        signed_out = client.delete("/api/session", headers={"Origin": "https://kamino.test"})
        assert signed_out.status_code == 200
        assert not client.get("/api/session").json()["authenticated"]
        assert (
            client.post("/api/session", headers={"Origin": "https://kamino.test"}).json()["role"]
            == "student"
        )


def test_public_cookie_expires_and_renewal_restart_and_code_share_the_same_quota(
    tmp_path, monkeypatch
):
    import time

    now = time.time()
    config = settings(tmp_path, public_student_access=True)
    with TestClient(create_app(config), base_url="https://kamino.test") as client:
        client.post("/api/session", headers={"Origin": "https://kamino.test"})
        cookie = dict(client.cookies)["kamino_session"]
        assert upload(client).status_code == 202
        assert upload(client).status_code == 429
        monkeypatch.setattr(time, "time", lambda: now + 1801)
        assert (
            client.get(
                f"/api/jobs/{uuid4()}", headers={"Cookie": f"kamino_session={cookie}"}
            ).status_code
            == 401
        )
        assert (
            client.post("/api/session", headers={"Origin": "https://kamino.test"}).json()["role"]
            == "student"
        )
        assert upload(client).status_code == 202
    monkeypatch.setattr(time, "time", lambda: now + 3602)
    with TestClient(create_app(config), base_url="https://kamino.test") as client:
        client.post("/api/session", headers={"Origin": "https://kamino.test"})
        response = upload(client)
        assert response.status_code == 429
        assert int(response.headers["retry-after"]) > 0
        sign_in(client, "friend-test-code")
        assert upload(client).status_code == 429
    with TestClient(
        create_app(replace(config, public_student_access=False)), base_url="https://kamino.test"
    ) as client:
        assert (
            client.post("/api/session", headers={"Origin": "https://kamino.test"}).status_code
            == 401
        )


def test_public_access_environment_flag_is_explicit_and_fail_closed(monkeypatch):
    monkeypatch.setenv("PHOTO2SIM_API_TOKEN", "test-secret")
    monkeypatch.setenv("PHOTO2SIM_STUDENT_CODE", "test-student")
    monkeypatch.setenv("PHOTO2SIM_PUBLIC_STUDENT_ACCESS", "true")
    assert Settings.from_env(env_file=None).public_student_access is True
    monkeypatch.setenv("PHOTO2SIM_PUBLIC_STUDENT_ACCESS", "false")
    assert Settings.from_env(env_file=None).public_student_access is False
    monkeypatch.setenv("PHOTO2SIM_PUBLIC_STUDENT_ACCESS", "typo")
    with pytest.raises(ValueError):
        Settings.from_env(env_file=None)


def test_public_session_rejects_remote_http_and_preserves_original_team_cookie(tmp_path):
    config = replace(settings(tmp_path, public_student_access=True), team_code="")
    with TestClient(create_app(config), base_url="http://kamino.test") as client:
        assert (
            client.post("/api/session", headers={"Origin": "http://kamino.test"}).status_code == 400
        )
    with TestClient(create_app(config), base_url="https://kamino.test") as client:
        sign_in(client, "original-test-secret")
        assert (
            client.post("/api/session", headers={"Origin": "https://kamino.test"}).json()["role"]
            == "team"
        )
        assert client.get("/api/session").json()["role"] == "team"
