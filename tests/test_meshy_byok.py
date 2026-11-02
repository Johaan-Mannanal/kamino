"""Per-request credentials must never fall back to the operator's Meshy account."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from io import BytesIO
from threading import Event
from time import sleep
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.contracts import JobRecord
from photo2sim.integrations.meshy import MeshyProvider

HEADER = "X-Meshy-Key"
KEY_A = "msy_user_a_private_key"
KEY_B = "msy_user_b_private_key"
OPERATOR_KEY = "msy_operator_must_never_be_used"


def image():
    buffer = BytesIO()
    Image.new("RGB", (8, 8)).save(buffer, "PNG")
    return [("images", ("photo.png", buffer.getvalue(), "image/png"))]


def ready(client, job_id, status="awaiting_properties"):
    for _ in range(300):
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] == status:
            return job
        if job["status"] == "failed" and status != "failed":
            pytest.fail(str(job["error"]))
        sleep(0.01)
    pytest.fail("Worker did not reach expected status")


def config(tmp_path, **values):
    return Settings(
        data_dir=tmp_path, provider="meshy", meshy_api_key=OPERATOR_KEY, poll_interval=0, **values
    )


def test_meshy_server_starts_without_an_operator_key(tmp_path):
    settings = Settings(data_dir=tmp_path, provider="meshy")
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/health").json()["provider"] == "meshy"


@pytest.mark.parametrize(
    "key", [None, "", "not-a-meshy-key", "msy_has whitespace", "msy_" + "a" * 600]
)
def test_missing_or_malformed_key_rejected_before_job_or_provider_work(tmp_path, key):
    calls = []
    settings = config(tmp_path)
    provider = MeshyProvider(settings, httpx.MockTransport(lambda r: calls.append(r)))
    with TestClient(create_app(settings, provider)) as client:
        response = client.post("/api/jobs", files=image(), headers={HEADER: key} if key else {})
        assert response.status_code == 422
        assert response.json()["category"] == "meshy_credentials"
        assert not JobStore(tmp_path).active()
    assert calls == []
    assert not any(p.is_dir() for p in tmp_path.iterdir())


@pytest.mark.parametrize(
    "status,body,expected",
    [
        (401, {"message": KEY_A}, 422),
        (403, {"message": KEY_A}, 422),
        (200, {"balance": 0}, 402),
        (200, {"balance": "invalid"}, 503),
    ],
)
def test_free_preflight_rejects_bad_key_or_balance_without_paid_submission(
    tmp_path, status, body, expected
):
    requests = []

    def handle(request):
        requests.append((request.method, str(request.url)))
        return httpx.Response(status, json=body)

    settings = config(tmp_path)
    provider = MeshyProvider(settings, httpx.MockTransport(handle))
    with TestClient(create_app(settings, provider)) as client:
        response = client.post("/api/jobs", files=image(), headers={HEADER: KEY_A})
        assert response.status_code == expected
        assert KEY_A not in response.text
    assert requests == [("GET", "https://api.meshy.ai/openapi/v1/balance")]
    assert not any(p.is_dir() for p in tmp_path.iterdir())


def test_two_overlapping_jobs_use_only_their_own_key_and_never_persist_it(tmp_path):
    import trimesh

    mesh = trimesh.creation.box().export(file_type="glb")
    release = Event()
    polled = {KEY_A: Event(), KEY_B: Event()}
    requests = []

    def handle(request):
        auth = request.headers.get("authorization", "")
        requests.append((request.method, request.url.host, request.url.path, auth))
        if request.url.host == "assets.meshy.ai":
            assert not auth
            return httpx.Response(200, content=mesh)
        key = auth.removeprefix("Bearer ")
        assert key in polled, "Operator key must never be used"
        if request.url.path.endswith("/balance"):
            return httpx.Response(200, json={"balance": 100})
        if request.method == "POST":
            return httpx.Response(200, json={"result": "task-a" if key == KEY_A else "task-b"})
        assert request.url.path.endswith("task-a" if key == KEY_A else "task-b")
        polled[key].set()
        assert release.wait(5)
        return httpx.Response(
            200,
            json={
                "status": "SUCCEEDED",
                "progress": 100,
                "model_urls": {"glb": "https://assets.meshy.ai/model.glb"},
            },
        )

    settings = config(tmp_path)
    provider = MeshyProvider(settings, httpx.MockTransport(handle))
    with TestClient(create_app(settings, provider)) as client:
        try:
            a = client.post("/api/jobs", files=image(), headers={HEADER: KEY_A})
            b = client.post("/api/jobs", files=image(), headers={HEADER: KEY_B})
            assert a.status_code == b.status_code == 202
            assert polled[KEY_A].wait(5) and polled[KEY_B].wait(5)
        finally:
            release.set()
        jobs = [ready(client, r.json()["id"]) for r in [a, b]]
        for job in jobs:
            assert client.get(f"/api/jobs/{job['id']}/files/{job['mesh_path']}").content == mesh
    for path in tmp_path.rglob("*"):
        if path.is_file():
            assert KEY_A.encode() not in path.read_bytes()
            assert KEY_B.encode() not in path.read_bytes()
    assert OPERATOR_KEY == settings.meshy_api_key  # No global credential mutation.
    assert len([r for r in requests if r[0] == "POST"]) == 2


def interrupted_job(tmp_path):
    now = datetime.now(UTC)
    job = JobRecord(
        id=uuid4(),
        created_at=now,
        updated_at=now,
        status="reconstructing",
        provider="meshy",
        synthetic=False,
        source_images=["uploads/00.png"],
        provider_task_id="existing-task",
    )
    store = JobStore(tmp_path)
    store.job_dir(job.id).mkdir()
    (store.job_dir(job.id) / "earlier.zip").write_bytes(b"prior export preserved")
    store.create(job)
    return job


def test_restart_requires_key_then_resumes_only_saved_task_and_preserves_prior_files(tmp_path):
    import trimesh

    mesh = trimesh.creation.box().export(file_type="glb")
    job = interrupted_job(tmp_path)
    requests = []

    def handle(request):
        requests.append((request.method, request.url.path))
        assert request.method == "GET", "Recovery must never create another task"
        if request.url.host == "assets.meshy.ai":
            assert "authorization" not in request.headers
            return httpx.Response(200, content=mesh)
        assert request.headers["authorization"] == f"Bearer {KEY_A}"
        if request.url.path.endswith("/balance"):
            # Polling an already paid task must still work with no credits left.
            return httpx.Response(200, json={"balance": 0})
        assert request.url.path.endswith("/existing-task")
        return httpx.Response(
            200,
            json={
                "status": "SUCCEEDED",
                "model_urls": {"glb": "https://assets.meshy.ai/existing.glb"},
            },
        )

    settings = config(tmp_path)
    with TestClient(
        create_app(settings, MeshyProvider(settings, httpx.MockTransport(handle)))
    ) as client:
        failed = ready(client, job.id, "failed")
        assert failed["error"]["code"] == "meshy_key_required"
        assert requests == []
        assert client.post(f"/api/jobs/{job.id}/resume-reconstruction").status_code == 422
        response = client.post(f"/api/jobs/{job.id}/resume-reconstruction", headers={HEADER: KEY_A})
        assert response.status_code == 202
        restored = ready(client, job.id)
        assert restored["provider_task_id"] == "existing-task"
        assert (
            client.get(f"/api/jobs/{job.id}/files/earlier.zip").content == b"prior export preserved"
        )
        assert (
            client.post(
                f"/api/jobs/{job.id}/resume-reconstruction", headers={HEADER: KEY_A}
            ).status_code
            == 409
        )
    assert all(method == "GET" for method, _ in requests)


def test_meshy_header_is_allowed_for_cross_origin_uploads(tmp_path):
    with TestClient(create_app(config(tmp_path))) as client:
        response = client.options(
            "/api/jobs",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": HEADER,
            },
        )
        assert response.status_code == 200


def test_concurrent_resume_claims_only_one_worker_and_never_submits(tmp_path):
    from threading import Barrier

    import trimesh

    mesh = trimesh.creation.box().export(file_type="glb")
    job = interrupted_job(tmp_path)
    preflights = Barrier(2)
    polling = Event()
    release = Event()
    requests = []

    def handle(request):
        requests.append((request.method, request.url.path))
        assert request.method == "GET"
        if request.url.path.endswith("/balance"):
            preflights.wait(5)
            return httpx.Response(200, json={"balance": 0})
        if request.url.host == "assets.meshy.ai":
            return httpx.Response(200, content=mesh)
        polling.set()
        assert release.wait(5)
        return httpx.Response(
            200,
            json={
                "status": "SUCCEEDED",
                "model_urls": {"glb": "https://assets.meshy.ai/existing.glb"},
            },
        )

    settings = config(tmp_path)
    with TestClient(
        create_app(settings, MeshyProvider(settings, httpx.MockTransport(handle)))
    ) as client:
        ready(client, job.id, "failed")
        with ThreadPoolExecutor(max_workers=2) as pool:
            try:
                futures = [
                    pool.submit(
                        client.post,
                        f"/api/jobs/{job.id}/resume-reconstruction",
                        headers={HEADER: KEY_A},
                    )
                    for _ in range(2)
                ]
                responses = [future.result(10) for future in futures]
                assert sorted(r.status_code for r in responses) == [202, 409]
                assert polling.wait(5)
            finally:
                release.set()
        ready(client, job.id)
    assert len([path for _, path in requests if path.endswith("/existing-task")]) == 1


def test_user_meshy_key_does_not_bypass_application_access(tmp_path):
    requests = []
    settings = config(tmp_path, api_token="private-application-token")
    provider = MeshyProvider(
        settings, httpx.MockTransport(lambda request: requests.append(request))
    )
    with TestClient(create_app(settings, provider)) as client:
        response = client.post("/api/jobs", files=image(), headers={HEADER: KEY_A})
        assert response.status_code == 401
        response = client.post(
            "/api/jobs",
            files=image(),
            headers={HEADER: KEY_A, "Authorization": "Bearer wrong-application-token"},
        )
        assert response.status_code == 401
    assert requests == []


def test_failed_free_preflight_does_not_consume_shared_paid_mesh_quota(tmp_path):
    from photo2sim.api.access_limits import AccessLimits

    settings = config(
        tmp_path,
        api_token="application-test-secret",
        student_code="student-test-code",
        public_student_access=True,
        public_origin="https://kamino.test",
    )
    requests = []

    def handle(request):
        requests.append(request.method)
        return httpx.Response(503, json={"message": "temporary balance outage"})

    provider = MeshyProvider(settings, httpx.MockTransport(handle))
    with TestClient(
        create_app(settings, provider),
        base_url="https://kamino.test",
        headers={"Origin": "https://kamino.test"},
    ) as client:
        assert client.post("/api/session").status_code == 200
        for _ in range(3):
            response = client.post("/api/jobs", files=image(), headers={HEADER: KEY_A})
            assert response.status_code == 503
        with __import__("sqlite3").connect(AccessLimits(tmp_path).database) as connection:
            assert (
                connection.execute("SELECT COUNT(*) FROM usage WHERE action='mesh'").fetchone()[0]
                == 0
            )
    assert requests == ["GET"] * 3
