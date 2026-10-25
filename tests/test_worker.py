"""Paid submission happens once; transient reads recover within a bounded budget."""

import struct
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest

from photo2sim.api import worker as worker_module
from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.api.worker import JobWorker
from photo2sim.contracts import JobRecord
from photo2sim.integrations.meshy import MeshyProvider


def run_job(tmp_path, monkeypatch, handle, configure_worker=None):
    monkeypatch.setattr(worker_module, "PROVIDER_RETRY_DELAY_S", 0)
    settings = Settings(data_dir=tmp_path, provider="meshy", meshy_api_key="test-key")
    store = JobStore(tmp_path)
    job_id = uuid4()
    now = datetime.now(UTC)
    root = store.job_dir(job_id)
    root.mkdir()
    (root / "image.png").write_bytes(b"already-verified-upload")
    store.create(
        JobRecord(
            id=job_id,
            status="queued",
            provider="meshy",
            synthetic=False,
            source_images=["image.png"],
            created_at=now,
            updated_at=now,
        )
    )
    provider = MeshyProvider(settings, transport=httpx.MockTransport(handle))
    worker = JobWorker(store, provider, settings)
    if configure_worker is not None:
        configure_worker(worker)
    try:
        worker.run(job_id)
    finally:
        worker.close()
    return store.get(job_id), root


def success_response(request):
    if request.method == "POST":
        return httpx.Response(200, json={"result": "paid-task"})
    if request.url.host == "api.meshy.ai":
        assert request.url.path.endswith("/paid-task")
        return httpx.Response(
            200,
            json={
                "status": "SUCCEEDED",
                "progress": 100,
                "model_urls": {"glb": "https://assets.meshy.ai/mesh.glb"},
            },
        )
    content = b'{"asset":{"version":"2.0"}}'
    content += b" " * (-len(content) % 4)
    payload = (
        b"glTF"
        + struct.pack("<II", 2, 20 + len(content))
        + struct.pack("<II", len(content), 0x4E4F534A)
        + content
    )
    return httpx.Response(200, content=payload)


@pytest.mark.parametrize("operation", ["poll", "download"])
@pytest.mark.parametrize("failure", [503, "timeout"])
def test_transient_read_recovers_without_resubmission(tmp_path, monkeypatch, operation, failure):
    calls = {"submit": 0, "poll": 0, "download": 0}

    def handle(request):
        name = (
            "submit"
            if request.method == "POST"
            else "poll"
            if request.url.host == "api.meshy.ai"
            else "download"
        )
        calls[name] += 1
        if name == operation and calls[name] == 1:
            if failure == "timeout":
                raise httpx.ReadTimeout("private transport detail", request=request)
            return httpx.Response(failure)
        return success_response(request)

    job, root = run_job(tmp_path, monkeypatch, handle)
    assert job.status == "awaiting_properties"
    assert job.provider_task_id == "paid-task"
    assert calls["submit"] == 1
    assert calls[operation] == 2
    assert (root / job.mesh_path).is_file()
    assert not list(root.rglob("*.part"))


@pytest.mark.parametrize("operation", ["poll", "download", "submit"])
@pytest.mark.parametrize("http_status, expected_attempts", [(503, 3), (401, 1), (404, 1)])
def test_read_retries_are_bounded_and_submission_is_never_retried(
    tmp_path, monkeypatch, operation, http_status, expected_attempts
):
    calls = {"submit": 0, "poll": 0, "download": 0}

    def handle(request):
        name = (
            "submit"
            if request.method == "POST"
            else "poll"
            if request.url.host == "api.meshy.ai"
            else "download"
        )
        calls[name] += 1
        if name == operation:
            return httpx.Response(http_status)
        return success_response(request)

    job, root = run_job(tmp_path, monkeypatch, handle)
    assert job.status == "failed"
    assert calls["submit"] == 1
    assert calls[operation] == (1 if operation == "submit" else expected_attempts)
    assert job.provider_task_id == (None if operation == "submit" else "paid-task")
    assert job.mesh_path is None
    assert not list(root.rglob("*.part"))


def test_uncertain_submission_is_not_retried(tmp_path, monkeypatch):
    calls = []

    def handle(request):
        calls.append(request.method)
        raise httpx.ReadTimeout("private transport detail", request=request)

    job, _ = run_job(tmp_path, monkeypatch, handle)
    assert calls == ["POST"]
    assert job.status == "failed"
    assert job.error.code == "submission_uncertain"
    assert "private" not in job.error.message


def test_shutdown_during_backoff_keeps_saved_task_resumable(tmp_path, monkeypatch):
    waits = []
    calls = []

    def configure(worker):
        def interrupted_wait(seconds):
            waits.append(seconds)
            worker.stopping.set()
            return True

        monkeypatch.setattr(worker.stopping, "wait", interrupted_wait)

    def handle(request):
        calls.append(request.method)
        if request.method == "GET":
            return httpx.Response(503)
        return success_response(request)

    job, _ = run_job(tmp_path, monkeypatch, handle, configure)
    assert calls == ["POST", "GET"]
    assert waits == [0]
    assert job.status == "reconstructing"
    assert job.provider_task_id == "paid-task"
    assert job.error is None
