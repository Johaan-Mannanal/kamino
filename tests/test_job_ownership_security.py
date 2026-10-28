"""Private browser ownership with ordinary public-session renewal and legacy recovery."""

from uuid import UUID

from fastapi.testclient import TestClient
from test_access_tiers import settings, upload
from test_assembly_jobs_api import upload as assembly_upload

from photo2sim.api.app import create_app
from photo2sim.api.store import JobStore

ORIGIN = {"Origin": "https://kamino.test"}


def public(client):
    result = client.post("/api/session", headers=ORIGIN)
    assert result.status_code == 200
    assert result.json()["role"] == "student"


def test_other_public_browser_cannot_read_change_or_download_a_rigid_job(tmp_path):
    app = create_app(settings(tmp_path, public_student_access=True))
    with TestClient(app, base_url="https://kamino.test") as owner:
        public(owner)
        created = upload(owner)
        assert created.status_code == 202
        base = f"/api/jobs/{created.json()['id']}"
        saved = owner.get(base)
        assert saved.status_code == 200
        assert saved.headers["Cache-Control"] == "private, no-store"
        with TestClient(app, base_url="https://kamino.test") as other:
            public(other)
            for method, path, body in [
                ("GET", base, None),
                ("GET", base + "/files/uploads/00.png", None),
                ("GET", base + "/suggestions", None),
                ("PATCH", base + "/orientation", {"x_deg": 90}),
                ("POST", base + "/process", None),
                ("POST", base + "/suggestions", {}),
            ]:
                response = other.request(method, path, json=body, headers=ORIGIN)
                assert response.status_code == 403, (method, path, response.text)
                assert response.json()["category"] == "job_access"


def test_access_renewal_keeps_browser_ownership_and_tampering_does_not_grant_access(tmp_path):
    app = create_app(settings(tmp_path, public_student_access=True))
    with TestClient(app, base_url="https://kamino.test") as client:
        public(client)
        job = upload(client).json()
        base = f"/api/jobs/{job['id']}"
        owner_cookie = client.cookies.get("kamino_owner")
        assert owner_cookie
        client.cookies.delete("kamino_session")
        public(client)
        assert client.cookies.get("kamino_owner") == owner_cookie
        assert client.get(base).status_code == 200
        client.cookies.delete("kamino_owner")
        client.cookies.set(
            "kamino_owner", owner_cookie[:-1] + ("a" if owner_cookie[-1] != "a" else "b")
        )
        assert client.get(base).status_code == 403


def test_legacy_jobs_are_not_silently_claimed_and_team_can_recover_without_changing_files(tmp_path):
    app = create_app(settings(tmp_path, public_student_access=True))
    with TestClient(app, base_url="https://kamino.test") as client:
        public(client)
        job = upload(client).json()
        store = JobStore(tmp_path)
        record = store.get(UUID(job["id"]))
        # Simulate a persisted record from before owner metadata existed.
        store.update(record.id, owner_principal_id=None)
        original = (store.job_dir(record.id) / "uploads/00.png").read_bytes()
        base = f"/api/jobs/{record.id}"
        assert client.get(base).status_code == 403
        assert (
            client.post(
                base + "/claim", json={"acknowledge_legacy_claim": True}, headers=ORIGIN
            ).status_code
            == 403
        )
        client.post("/api/session", headers={**ORIGIN, "Authorization": "Bearer team-test-code"})
        assert client.get(base).status_code == 200
        assert (
            client.post(
                base + "/claim", json={"acknowledge_legacy_claim": True}, headers=ORIGIN
            ).status_code
            == 200
        )
        assert store.get(record.id).owner_principal_id
        client.cookies.delete("kamino_session")
        public(client)
        assert client.get(base).status_code == 200
        assert client.get(base + "/files/uploads/00.png").content == original


def test_assembly_ownership_covers_revisions_mapping_processing_and_originals(tmp_path):
    app = create_app(settings(tmp_path, public_student_access=True))
    with TestClient(app, base_url="https://kamino.test", headers=ORIGIN) as owner:
        public(owner)
        result = assembly_upload(owner)
        assert result.status_code == 202, result.text
        job = result.json()
        base = f"/api/assembly-jobs/{job['id']}"
        before = owner.get(base).json()
        with TestClient(app, base_url="https://kamino.test", headers=ORIGIN) as other:
            public(other)
            for method, path, body in [
                ("GET", base, None),
                ("GET", base + "/files/" + job["project_path"], None),
                ("PUT", base + "/revisions", {}),
                ("PUT", base + "/mapping-review", {}),
                ("POST", base + "/process", {"expected_revision": 1}),
            ]:
                assert other.request(method, path, json=body).status_code == 403
        assert owner.get(base).json() == before
