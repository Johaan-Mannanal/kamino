from io import BytesIO
from pathlib import Path
from time import sleep
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.contracts import JobRecord
from photo2sim.integrations.reconstruction import MockProvider, ProviderSnapshot


def png():
    output = BytesIO()
    Image.new("RGB", (8, 8), "red").save(output, format="PNG")
    return output.getvalue()


def upload(client):
    return client.post("/api/jobs", files=[("images", ("object.png", png(), "image/png"))])


def wait_for(client, job_id, status):
    for _ in range(200):
        response = client.get(f"/api/jobs/{job_id}")
        assert response.status_code == 200
        job = response.json()
        if job["status"] == status:
            return job
        if job["status"] == "failed" and status != "failed":
            pytest.fail(str(job["error"]))
        sleep(0.01)
    pytest.fail(f"Job never reached {status}")


def properties():
    return {
        "dimensions_m": {"x": 0.04, "y": 0.05, "z": 0.06, "source": "measured"},
        "mass_kg": {"value": 0.08, "source": "user_supplied"},
    }


def test_mock_upload_produces_downloadable_mesh_and_saves_properties_across_restart(tmp_path):
    settings = Settings(data_dir=tmp_path)
    with TestClient(create_app(settings)) as client:
        response = upload(client)
        assert response.status_code == 202
        job_id = response.json()["id"]
        job = wait_for(client, job_id, "awaiting_properties")
        assert job["synthetic"] is True
        assert job["provider"] == "mock"
        assert job["progress"] == 100
        assert job["properties"] is None
        assert job["export_path"] is None
        mesh = client.get(f"/api/jobs/{job_id}/files/{job['mesh_path']}")
        assert mesh.status_code == 200
        assert "v -0.5 -0.5 -0.5" in mesh.text
        result = client.patch(f"/api/jobs/{job_id}/properties", json=properties())
        assert result.status_code == 200
        assert result.json()["status"] == "awaiting_properties"
    with TestClient(create_app(settings)) as client:
        job = client.get(f"/api/jobs/{job_id}").json()
        assert job["properties"]["mass_kg"]["value"] == 0.08
        assert job["properties"]["dimensions_m"]["source"] == "measured"
        assert client.get(f"/api/jobs/{job_id}/files/{job['source_images'][0]}").content == png()


@pytest.mark.parametrize(
    "files, expected",
    [
        ([], 422),
        ([("images", ("fake.png", b"not an image", "image/png"))], 422),
        ([("images", ("a.png", png(), "image/png"))] * 5, 422),
    ],
)
def test_bad_upload_creates_no_job_directory(tmp_path, files, expected):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.post("/api/jobs", files=files).status_code == expected
    assert not any(path.is_dir() for path in tmp_path.iterdir())


def test_oversized_upload_is_rejected_before_job_creation(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, max_image_bytes=20))) as client:
        assert upload(client).status_code == 413
    assert not any(path.is_dir() for path in tmp_path.iterdir())


def test_property_errors_do_not_change_saved_values(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        job_id = upload(client).json()["id"]
        wait_for(client, job_id, "awaiting_properties")
        bad = properties()
        bad["mass_kg"]["value"] = -1
        assert client.patch(f"/api/jobs/{job_id}/properties", json=bad).status_code == 422
        assert client.get(f"/api/jobs/{job_id}").json()["properties"] is None


def test_download_cannot_escape_job_directory_or_follow_external_symlink(tmp_path):
    outside = tmp_path / "private.txt"
    outside.write_text("private")
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        job_id = upload(client).json()["id"]
        wait_for(client, job_id, "awaiting_properties")
        assert client.get(f"/api/jobs/{job_id}/files/..%2Fprivate.txt").status_code == 404
        link = tmp_path / job_id / "reconstruction" / "outside.txt"
        try:
            link.symlink_to(outside)
        except OSError:
            pytest.skip("OS does not permit symlinks")
        assert client.get(f"/api/jobs/{job_id}/files/reconstruction/outside.txt").status_code == 404


class BrokenProvider(MockProvider):
    def poll(self, task_id):
        raise RuntimeError("secret-key-123 https://private.example/signed?token=456")


def test_provider_failure_is_sanitized_and_preserves_inputs_and_task_id(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path), BrokenProvider())) as client:
        job_id = upload(client).json()["id"]
        job = wait_for(client, job_id, "failed")
        assert job["provider_task_id"]
        assert "secret-key" not in str(job)
        assert "token=456" not in str(job)
        assert client.get(f"/api/jobs/{job_id}/files/{job['source_images'][0]}").status_code == 200
        assert client.patch(f"/api/jobs/{job_id}/properties", json=properties()).status_code == 409


class ResumeOnlyProvider(MockProvider):
    def submit(self, images):
        raise AssertionError("Recovery must never resubmit an existing task")

    def poll(self, task_id):
        assert task_id == "existing-task"
        return ProviderSnapshot(status="succeeded", progress=100)


def seed_active(settings, task_id):
    from datetime import UTC, datetime

    job_id = uuid4()
    now = datetime.now(UTC)
    store = JobStore(settings.data_dir)
    store.create(
        JobRecord(
            id=job_id,
            provider="mock",
            synthetic=True,
            status="reconstructing",
            created_at=now,
            updated_at=now,
            provider_task_id=task_id,
        )
    )
    return job_id


def test_restart_resumes_existing_provider_task_without_submitting_again(tmp_path):
    settings = Settings(data_dir=tmp_path)
    job_id = seed_active(settings, "existing-task")
    with TestClient(create_app(settings, ResumeOnlyProvider())) as client:
        job = wait_for(client, job_id, "awaiting_properties")
        assert job["provider_task_id"] == "existing-task"


def test_restart_marks_uncertain_submission_failed_instead_of_creating_duplicate(tmp_path):
    settings = Settings(data_dir=tmp_path)
    job_id = seed_active(settings, None)
    with TestClient(create_app(settings, ResumeOnlyProvider())) as client:
        job = wait_for(client, job_id, "failed")
        assert job["error"]["code"] == "submission_uncertain"


def test_missing_jobs_and_artifacts_return_404(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.get(f"/api/jobs/{uuid4()}").status_code == 404
        job_id = upload(client).json()["id"]
        wait_for(client, job_id, "awaiting_properties")
        assert client.get(f"/api/jobs/{job_id}/files/missing.obj").status_code == 404


def test_health_exposes_provider_but_no_credentials(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.get("/api/health").json() == {"status": "ok", "provider": "mock"}


def test_reconstruction_provider_mismatch_after_restart_is_not_run_as_mock(tmp_path):
    settings = Settings(data_dir=tmp_path)
    job_id = seed_active(settings, "existing-task")
    JobStore(tmp_path).update(job_id, provider="meshy", synthetic=False)
    with TestClient(create_app(settings)) as client:
        job = wait_for(client, job_id, "failed")
        assert job["error"]["code"] == "provider_mismatch"
        assert job["synthetic"] is False


def test_server_does_not_trust_upload_filenames(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        result = client.post(
            "/api/jobs", files=[("images", ("../../escape.exe", png(), "image/png"))]
        )
        job = wait_for(client, result.json()["id"], "awaiting_properties")
        assert job["source_images"] == ["uploads/00.png"]
        assert not Path(tmp_path.parent / "escape.exe").exists()


def test_jpeg_with_multi_picture_metadata_is_accepted_and_preserved(tmp_path):
    stream = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(
        stream,
        format="MPO",
        save_all=True,
        append_images=[Image.new("RGB", (8, 8), "red")],
    )
    content = stream.getvalue()
    with Image.open(BytesIO(content)) as image:
        assert image.format == "MPO"
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        response = client.post(
            "/api/jobs", files=[("images", ("iphone.jpg", content, "image/jpeg"))]
        )
        assert response.status_code == 202
        job = wait_for(client, response.json()["id"], "awaiting_properties")
        assert job["source_images"] == ["uploads/00.jpg"]
        assert client.get(f"/api/jobs/{job['id']}/files/uploads/00.jpg").content == content
