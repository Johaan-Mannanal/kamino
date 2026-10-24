"""Catch rotations applied after scaling, lost orientation, and processing/edit races."""

import json
from io import BytesIO
from zipfile import ZipFile

import numpy as np
import pytest
import trimesh
from fastapi.testclient import TestClient
from test_pipeline import seed_job, terminal

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.assets.prepare import prepare_asset
from photo2sim.contracts import AssetProperties


@pytest.mark.parametrize(
    ("angles", "dimensions", "expected"),
    [
        (
            {"x_deg": 90},
            (0.02, 0.01, 0.04),
            [
                (-0.01, 0.005, -0.02),
                (0.01, 0.005, -0.02),
                (-0.01, 0.005, 0.02),
                (-0.01, -0.005, -0.02),
            ],
        ),
        (
            {"x_deg": 90, "z_deg": 90},
            (0.01, 0.02, 0.04),
            [
                (-0.005, -0.01, -0.02),
                (-0.005, 0.01, -0.02),
                (-0.005, -0.01, 0.02),
                (0.005, -0.01, -0.02),
            ],
        ),
    ],
)
def test_rotation_precedes_dimension_scaling_and_uses_fixed_xyz_order(
    tmp_path, angles, dimensions, expected
):
    from photo2sim.contracts import Orientation

    source = tmp_path / "source.obj"
    mesh = trimesh.Trimesh(
        vertices=[(0, 0, 0), (2, 0, 0), (0, 4, 0), (0, 0, 1)],
        faces=[(0, 2, 1), (0, 1, 3), (0, 3, 2), (1, 2, 3)],
        process=False,
    )
    mesh.export(source)
    before = source.read_bytes()
    props = AssetProperties(
        dimensions_m=dict(zip(("x", "y", "z"), dimensions), source="estimated"),
        mass_kg={"value": 0.1, "source": "estimated"},
    )
    asset = prepare_asset(source, tmp_path / "prepared", props, orientation=Orientation(**angles))
    saved = trimesh.load_mesh(tmp_path / "prepared" / asset.visual_mesh, process=False)
    for point in expected:
        assert np.min(np.linalg.norm(saved.vertices - point, axis=1)) < 1e-8
    assert np.allclose(saved.extents, dimensions)
    assert source.read_bytes() == before
    assert asset.orientation == Orientation(**angles)
    assert any("before" in n and "rotation" in n.lower() for n in asset.notes)


def test_saved_orientation_survives_restart_and_reaches_export_zip(tmp_path):
    job_id, store = seed_job(tmp_path)
    source = store.job_dir(job_id) / store.get(job_id).mesh_path
    before = source.read_bytes()
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.get(f"/api/jobs/{job_id}").json()["orientation"]["x_deg"] == 0
        r = client.patch(f"/api/jobs/{job_id}/orientation", json={"x_deg": 90})
        assert r.status_code == 200
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.get(f"/api/jobs/{job_id}").json()["orientation"]["x_deg"] == 90
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        job = terminal(client, job_id)
        assert job["status"] == "completed", job
        assert job["asset"]["orientation"]["x_deg"] == 90
        response = client.get(f"/api/jobs/{job_id}/files/{job['bundle_path']}")
        with ZipFile(BytesIO(response.content)) as z:
            assert json.loads(z.read("asset.json"))["orientation"]["x_deg"] == 90
        assert client.patch(f"/api/jobs/{job_id}/orientation", json={}).status_code == 409
    assert source.read_bytes() == before


@pytest.mark.parametrize(
    "payload", [{"x_deg": 181}, {"x_deg": -181}, {"x_deg": "nan"}, {"x_deg": True}, {"scale": 2}]
)
def test_invalid_orientation_rejected_without_edit(tmp_path, payload):
    job_id, store = seed_job(tmp_path)
    before = store.get(job_id).model_dump()
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.patch(f"/api/jobs/{job_id}/orientation", json=payload).status_code == 422
    assert store.get(job_id).model_dump() == before


def test_orientation_edit_cannot_race_processing_claim(tmp_path, monkeypatch):
    job_id, store = seed_job(tmp_path)
    original = JobStore.update

    def claim_before_save(self, target, **changes):
        if "orientation" in changes:
            original(self, target, status="preparing")
        return original(self, target, **changes)

    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        monkeypatch.setattr(JobStore, "update", claim_before_save)
        r = client.patch(f"/api/jobs/{job_id}/orientation", json={"x_deg": 90})
        assert r.status_code == 409
        assert store.get(job_id).status == "preparing"
        assert store.get(job_id).orientation.x_deg == 0


def test_failed_attempt_can_change_orientation_without_losing_artifacts(tmp_path, monkeypatch):
    from photo2sim.api import pipeline

    job_id, store = seed_job(tmp_path)
    monkeypatch.setattr(pipeline, "validate_export", lambda scene: {"passed": False})
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        failed = terminal(client, job_id)
        old_scene = store.job_dir(job_id) / failed["export_path"]
        before = old_scene.read_bytes()
        r = client.patch(f"/api/jobs/{job_id}/orientation", json={"x_deg": 90})
        assert r.status_code == 200
        job = r.json()
        assert job["status"] == "awaiting_properties"
        assert job["asset"] is None and job["export_path"] is None
        assert job["validation_path"] is None and job["bundle_path"] is None
        assert old_scene.read_bytes() == before
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        second = terminal(client, job_id)
        assert second["asset"]["orientation"]["x_deg"] == 90
        assert second["export_path"] != failed["export_path"]


def test_reconstruction_failure_cannot_be_reset_by_orientation_edit(tmp_path):
    from photo2sim.contracts import JobError

    job_id, store = seed_job(tmp_path, status="failed")
    store.update(job_id, error=JobError(code="provider_failed", message="Provider failed"))
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert (
            client.patch(f"/api/jobs/{job_id}/orientation", json={"x_deg": 90}).status_code == 409
        )
