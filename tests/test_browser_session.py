from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings


def app(tmp_path, token="test-private-code"):
    return create_app(Settings(data_dir=tmp_path, api_token=token))


def login(client):
    return client.post("/api/session", headers={"Authorization": "Bearer test-private-code"})


def test_session_survives_new_client_and_server_restart_without_exposing_code(tmp_path):
    with TestClient(app(tmp_path), base_url="https://kamino.test") as client:
        assert client.get("/api/session").json() == {"required": True, "authenticated": False}
        assert client.get(f"/api/jobs/{uuid4()}").status_code == 401
        response = login(client)
        assert response.status_code == 200
        cookie = response.headers["set-cookie"]
        assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=strict" in cookie
        assert "test-private-code" not in cookie + response.text
        cookies = dict(client.cookies)
    with TestClient(app(tmp_path), base_url="https://kamino.test", cookies=cookies) as reopened:
        assert reopened.get("/api/session").json()["authenticated"] is True
        assert reopened.get(f"/api/jobs/{uuid4()}").status_code == 404
        assert reopened.get(f"/api/assembly-jobs/{uuid4()}").status_code == 404


def test_wrong_code_and_tampered_cookie_cannot_authorize(tmp_path):
    with TestClient(app(tmp_path), base_url="https://kamino.test") as client:
        assert (
            client.post("/api/session", headers={"Authorization": "Bearer wrong"}).status_code
            == 401
        )
        assert not client.cookies
        login(client)
        name, value = next(iter(dict(client.cookies).items()))
        client.cookies.clear()
        client.cookies.set(name, value + "bad")
        assert client.get(f"/api/jobs/{uuid4()}").status_code == 401


def test_session_expiry_rotation_and_signout(tmp_path, monkeypatch):
    import time

    now = time.time()
    with TestClient(app(tmp_path), base_url="https://kamino.test") as client:
        login(client)
        cookies = dict(client.cookies)
        assert (
            client.delete("/api/session", headers={"Origin": "https://kamino.test"}).status_code
            == 200
        )
        assert client.get(f"/api/jobs/{uuid4()}").status_code == 401
    with TestClient(
        app(tmp_path, "rotated-code"), base_url="https://kamino.test", cookies=cookies
    ) as client:
        assert client.get(f"/api/jobs/{uuid4()}").status_code == 401
    # Explicit Cookie header avoids relying on the client's cookie expiry enforcement.
    monkeypatch.setattr(time, "time", lambda: now + 13 * 3600)
    with TestClient(app(tmp_path), base_url="https://kamino.test") as client:
        assert (
            client.get(
                f"/api/jobs/{uuid4()}",
                headers={"Cookie": "; ".join(f"{k}={v}" for k, v in cookies.items())},
            ).status_code
            == 401
        )


@pytest.mark.parametrize("origin", [None, "https://evil.test", "null"])
def test_cookie_cannot_authorize_cross_origin_mutation(tmp_path, origin):
    with TestClient(app(tmp_path), base_url="https://kamino.test") as client:
        login(client)
        headers = {"Origin": origin} if origin else {}
        assert client.post("/api/jobs", headers=headers).status_code == 403
        # Same-origin cookies reach validation; this invalid request creates no job.
        assert (
            client.post("/api/jobs", headers={"Origin": "https://kamino.test"}).status_code == 422
        )


def test_bearer_clients_and_unprotected_local_mode_still_work(tmp_path):
    with TestClient(app(tmp_path)) as client:
        assert (
            client.get(
                f"/api/jobs/{uuid4()}", headers={"Authorization": "Bearer test-private-code"}
            ).status_code
            == 404
        )
    with TestClient(app(tmp_path, "")) as client:
        assert client.get("/api/session").json() == {"required": False, "authenticated": True}


def test_public_origin_matches_browser_default_port_serialization(tmp_path):
    settings = Settings(
        data_dir=tmp_path, api_token="test-private-code", public_origin="https://KAMINO.test:443"
    )
    with TestClient(create_app(settings), base_url="http://internal:8000") as client:
        assert (
            client.post(
                "/api/session",
                headers={
                    "Authorization": "Bearer test-private-code",
                    "Origin": "https://kamino.test",
                },
            ).status_code
            == 200
        )


def test_signin_rejects_cross_origin_and_plain_http_remote(tmp_path):
    with TestClient(app(tmp_path), base_url="https://kamino.test") as client:
        assert (
            client.post(
                "/api/session",
                headers={
                    "Authorization": "Bearer test-private-code",
                    "Origin": "https://evil.test",
                },
            ).status_code
            == 403
        )
    with TestClient(app(tmp_path), base_url="http://kamino.test") as client:
        assert login(client).status_code == 400


def test_explicit_public_origin_supports_tls_termination_without_trusting_forwarded_headers(
    tmp_path,
):
    settings = Settings(
        data_dir=tmp_path, api_token="test-private-code", public_origin="https://kamino.test"
    )
    with TestClient(create_app(settings), base_url="http://internal:8000") as client:
        response = client.post(
            "/api/session",
            headers={"Authorization": "Bearer test-private-code", "Origin": "https://kamino.test"},
        )
        assert response.status_code == 200
        assert "Secure" in response.headers["set-cookie"]
        cookies = "; ".join(f"{k}={v}" for k, v in dict(client.cookies).items())
        assert (
            client.post(
                "/api/jobs", headers={"Cookie": cookies, "Origin": "https://kamino.test"}
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/api/jobs", headers={"Cookie": cookies, "Origin": "http://internal:8000"}
            ).status_code
            == 403
        )
