import httpx
from fastapi.testclient import TestClient

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings

TOKEN = "test-application-access-token-only"


def test_configured_access_protects_jobs_but_exposes_health_and_docs(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, api_token=TOKEN))) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/docs").status_code == 200
        schema = client.get("/openapi.json").json()
        assert schema["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"
        for header in (None, "Bearer wrong", "Basic wrong", "Bearer "):
            headers = {"Authorization": header} if header is not None else {}
            result = client.post("/api/jobs", headers=headers)
            assert result.status_code == 401
            assert result.headers["www-authenticate"] == "Bearer"
            assert TOKEN not in result.text
        assert (
            client.post("/api/jobs", headers={"Authorization": f"Bearer {TOKEN}"}).status_code
            == 422
        )
        assert (
            client.post("/api/jobs", headers={"Authorization": f"bearer {TOKEN}"}).status_code
            == 422
        )
    assert not any(p.is_dir() for p in tmp_path.iterdir())


def test_cors_permits_authorization_for_allowed_frontend_and_on_access_errors(tmp_path):
    origin = "https://demo.example.com"
    settings = Settings(data_dir=tmp_path, api_token=TOKEN, cors_origins=(origin,))
    with TestClient(create_app(settings)) as client:
        preflight = client.options(
            "/api/jobs",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == origin
        rejected = client.post("/api/jobs", headers={"Origin": origin})
        assert rejected.status_code == 401
        assert rejected.headers["access-control-allow-origin"] == origin
        other = client.options(
            "/api/jobs",
            headers={
                "Origin": "https://unapproved.example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert other.status_code == 400
        assert "access-control-allow-origin" not in other.headers


def test_unusual_authorization_bytes_are_rejected_without_server_error(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, api_token=TOKEN))) as client:
        result = client.post(
            "/api/jobs", headers=httpx.Headers([(b"authorization", b"Bearer \xff")])
        )
        assert result.status_code == 401
