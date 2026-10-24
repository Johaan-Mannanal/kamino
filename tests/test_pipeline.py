"""Exercise the HTTP pipeline with real preparation, export and headless physics."""

import json
import shutil
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from io import BytesIO
from threading import Event
from time import monotonic, sleep
from uuid import uuid4
from zipfile import ZipFile

import mujoco
import numpy as np
import pytest
import trimesh
from fastapi.testclient import TestClient
from PIL import Image

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.contracts import AssetProperties, JobRecord
from photo2sim.integrations.reconstruction import MockProvider


def seed_job(tmp_path, *, textured=False, status="awaiting_properties", confirmed=True):
    store = JobStore(tmp_path)
    job_id = uuid4()
    mesh_dir = store.job_dir(job_id) / "reconstruction"
    mesh_dir.mkdir(parents=True)
    mesh = trimesh.creation.box(extents=(2, 3, 4))
    if textured:
        mesh.visual = trimesh.visual.texture.TextureVisuals(
            uv=np.zeros((len(mesh.vertices), 2)), image=Image.new("RGB", (2, 2), "red")
        )
    suffix = "glb" if textured else "obj"
    mesh.export(mesh_dir / f"mesh.{suffix}")
    now = datetime.now(UTC)
    store.create(
        JobRecord(
            id=job_id,
            provider="mock",
            synthetic=True,
            status=status,
            created_at=now,
            updated_at=now,
            mesh_path=f"reconstruction/mesh.{suffix}",
            properties=AssetProperties(
                dimensions_m={"x": 0.04, "y": 0.05, "z": 0.06, "source": "estimated"},
                mass_kg={"value": 0.08, "source": "estimated", "note": "Synthetic assumed mass"},
            )
            if confirmed
            else None,
        )
    )
    return job_id, store


def terminal(client, job_id):
    deadline = monotonic() + 30
    while monotonic() < deadline:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in {"failed", "completed"}:
            return job
        sleep(0.02)
    pytest.fail(f"Job did not finish: {job}")


@pytest.mark.parametrize("textured", [False, True])
def test_process_downloads_portable_validated_bundle_and_preserves_inputs(tmp_path, textured):
    job_id, store = seed_job(tmp_path, textured=textured)
    original = store.get(job_id)
    source = store.job_dir(job_id) / original.mesh_path
    before = source.read_bytes()
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        started = client.post(f"/api/jobs/{job_id}/process")
        assert started.status_code == 202
        assert started.json()["status"] == "preparing"
        job = terminal(client, job_id)
        assert job["status"] == "completed", job
        assert job["asset"]["synthetic"] is True
        assert job["asset"]["properties"] == original.properties.model_dump(mode="json")
        report = client.get(f"/api/jobs/{job_id}/files/{job['validation_path']}").json()
        assert report["passed"] and report["portability_passed"]
        assert not report["viewer_inspected"]
        scene_response = client.get(f"/api/jobs/{job_id}/files/{job['export_path']}")
        assert scene_response.status_code == 200
        zipped = client.get(f"/api/jobs/{job_id}/files/{job['bundle_path']}")
        assert zipped.status_code == 200
        unpacked = tmp_path / "unpacked"
        with ZipFile(BytesIO(zipped.content)) as archive:
            assert {"scene.xml", "asset.json", "simulation.json", "validation-report.json"} <= set(
                archive.namelist()
            )
            assert all(".." not in name and not name.startswith("/") for name in archive.namelist())
            archive.extractall(unpacked)
        assert not list(unpacked.rglob("*.mtl"))
        assert not list(unpacked.rglob("*.png"))
        assert source.read_bytes() == before
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 409
        assert (
            client.patch(
                f"/api/jobs/{job_id}/properties", json=original.properties.model_dump(mode="json")
            ).status_code
            == 409
        )
    shutil.rmtree(store.job_dir(job_id))
    model = mujoco.MjModel.from_xml_path(str(unpacked / "scene.xml"))
    body = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, "asset")
    assert model.body_mass[body] == pytest.approx(0.08)


def test_process_requires_properties_without_changing_job(tmp_path):
    job_id, store = seed_job(tmp_path, confirmed=False)
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 409
        assert client.post(f"/api/jobs/{uuid4()}/process").status_code == 404
    assert store.get(job_id).status == "awaiting_properties"
    assert not (store.job_dir(job_id) / "attempts").exists()


def test_overlapping_processing_is_claimed_once(tmp_path, monkeypatch):
    from photo2sim.api import pipeline

    job_id, _ = seed_job(tmp_path)
    entered, release = Event(), Event()
    original = pipeline.prepare_asset

    def blocking_prepare(*args, **kwargs):
        entered.set()
        assert release.wait(10)
        return original(*args, **kwargs)

    monkeypatch.setattr(pipeline, "prepare_asset", blocking_prepare)
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        try:
            with ThreadPoolExecutor(max_workers=2) as executor:
                responses = list(
                    executor.map(lambda _: client.post(f"/api/jobs/{job_id}/process"), range(2))
                )
            assert sorted(r.status_code for r in responses) == [202, 409]
            assert entered.wait(5)
        finally:
            release.set()
        assert terminal(client, job_id)["status"] == "completed"


def test_failed_validation_retains_report_and_scene_and_retry_preserves_attempt(
    tmp_path, monkeypatch
):
    from photo2sim.api import pipeline

    job_id, store = seed_job(tmp_path)
    original = pipeline.validate_export
    monkeypatch.setattr(
        pipeline, "validate_export", lambda scene: {"passed": False, "checks": {"settled": False}}
    )
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        failed = terminal(client, job_id)
        assert failed["status"] == "failed"
        assert failed["error"]["code"] == "validation_failed"
        assert failed["bundle_path"] is None
        report_path = failed["validation_path"]
        assert client.get(f"/api/jobs/{job_id}/files/{report_path}").json()["passed"] is False
        assert client.get(f"/api/jobs/{job_id}/files/{failed['export_path']}").status_code == 200
        old_report = (store.job_dir(job_id) / report_path).read_bytes()
        monkeypatch.setattr(pipeline, "validate_export", original)
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        completed = terminal(client, job_id)
        assert completed["status"] == "completed", completed
        assert completed["validation_path"] != report_path
        assert (store.job_dir(job_id) / report_path).read_bytes() == old_report


@pytest.mark.parametrize("status", ["preparing", "validating"])
def test_restart_marks_interrupted_processing_failed_without_reconstruction(tmp_path, status):
    class NoSubmission(MockProvider):
        def submit(self, images):
            raise AssertionError("Cached processing must never submit a reconstruction")

    job_id, store = seed_job(tmp_path, status=status)
    keep = store.job_dir(job_id) / "partial.txt"
    keep.write_text("retained")
    with TestClient(create_app(Settings(data_dir=tmp_path), NoSubmission())) as client:
        job = terminal(client, job_id)
        assert job["status"] == "failed"
        assert job["error"]["code"] == "processing_interrupted"
    assert keep.read_text() == "retained"
    assert store.get(job_id).provider_task_id is None


def test_preparation_failure_is_sanitized_and_cached_mesh_is_retained(tmp_path, monkeypatch):
    from photo2sim.api import pipeline

    job_id, store = seed_job(tmp_path)
    source = store.job_dir(job_id) / store.get(job_id).mesh_path
    before = source.read_bytes()

    def broken(*args):
        raise RuntimeError("secret-key-123 https://private.example?token=456")

    monkeypatch.setattr(pipeline, "prepare_asset", broken)
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        job = terminal(client, job_id)
        assert job["status"] == "failed"
        assert job["error"]["code"] == "preparation_failed"
        assert "secret-key" not in json.dumps(job)
        assert "token=456" not in json.dumps(job)
        assert job["bundle_path"] is None
    assert source.read_bytes() == before


def test_failed_simulation_allows_correcting_properties_before_retry(tmp_path, monkeypatch):
    from photo2sim.api import pipeline

    job_id, store = seed_job(tmp_path)
    original = pipeline.validate_export
    monkeypatch.setattr(pipeline, "validate_export", lambda scene: {"passed": False})
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        failed = terminal(client, job_id)
        old_report = store.job_dir(job_id) / failed["validation_path"]
        changed = store.get(job_id).properties.model_dump(mode="json")
        changed["mass_kg"] = {"value": 0.12, "source": "user_supplied"}
        saved = client.patch(f"/api/jobs/{job_id}/properties", json=changed)
        assert saved.status_code == 200
        assert saved.json()["status"] == "awaiting_properties"
        assert saved.json()["asset"] is None
        assert saved.json()["export_path"] is None
        assert saved.json()["validation_path"] is None
        assert old_report.is_file()
        monkeypatch.setattr(pipeline, "validate_export", original)
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        job = terminal(client, job_id)
        assert job["status"] == "completed", job
        assert job["asset"]["properties"]["mass_kg"]["value"] == 0.12


def test_validator_exception_persists_safe_failure_report(tmp_path, monkeypatch):
    from photo2sim.api import pipeline

    job_id, _ = seed_job(tmp_path)

    def crash(scene):
        raise RuntimeError("secret-key-123 https://private.example?token=456")

    monkeypatch.setattr(pipeline, "validate_export", crash)
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        job = terminal(client, job_id)
        assert job["status"] == "failed"
        assert job["error"]["code"] == "validation_failed"
        assert job["validation_path"] is not None
        report = client.get(f"/api/jobs/{job_id}/files/{job['validation_path']}").json()
        assert report["passed"] is False
        assert "secret-key" not in json.dumps(report)
        assert "token=456" not in json.dumps(report)
        assert job["bundle_path"] is None
