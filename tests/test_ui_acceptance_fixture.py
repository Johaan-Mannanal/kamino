import hashlib
import io
import json
import zipfile
from uuid import uuid4

import pytest
import trimesh

from photo2sim.api.store import JobStore
from tools import ui_acceptance_fixture as fixture
from tools import ui_acceptance_server as server


@pytest.fixture
def archive(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "ACCEPTANCE_ROOT", tmp_path)
    payload = {
        "original/reconstruction/mesh.glb": trimesh.creation.box().export(file_type="glb"),
        **{f"original/uploads/{i:02}.jpg": bytes([i]) for i in range(3)},
    }
    manifest = {
        "files": [
            {"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            for name, data in payload.items()
        ]
    }
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as bundle:
        for name, data in payload.items():
            bundle.writestr(name, data)
        bundle.writestr("MANIFEST.json", json.dumps(manifest))
    raw = stream.getvalue()
    monkeypatch.setattr(fixture, "ARCHIVE_SHA256", hashlib.sha256(raw).hexdigest())
    monkeypatch.setattr(
        fixture,
        "MESH_SHA256",
        hashlib.sha256(payload["original/reconstruction/mesh.glb"]).hexdigest(),
    )
    path = tmp_path / "evidence.zip"
    path.write_bytes(raw)
    return path, server.acceptance_settings(tmp_path / "data", "test-only"), payload


def test_import_preserves_raw_inputs_and_requires_review(archive):
    path, settings, payload = archive
    before = path.read_bytes()
    job = fixture.import_can(settings, path)
    store = JobStore(settings.data_dir)
    assert store.get(job.id) == job
    assert not job.synthetic and job.provider == "meshy"
    assert job.status == "awaiting_properties"
    assert job.geometry_review is None and job.properties is None
    assert not job.legacy_sizing_allowed and not job.attempts
    for source, data in payload.items():
        assert (store.job_dir(job.id) / source.removeprefix("original/")).read_bytes() == data
    assert path.read_bytes() == before


def test_tampered_archive_is_rejected_before_job_creation(archive):
    path, settings, _ = archive
    path.write_bytes(path.read_bytes() + b"tampered")
    with pytest.raises(ValueError, match="archive checksum"):
        fixture.import_can(settings, path)
    assert not settings.data_dir.exists()


def test_receipt_and_mesh_required_for_non_synthetic_seed(archive):
    path, settings, _ = archive
    job = fixture.import_can(settings, path)
    root = JobStore(settings.data_dir).job_dir(job.id)
    (root / job.mesh_path).write_bytes(b"modified")
    with pytest.raises(ValueError, match="fixture"):
        server.seed_suggestions(settings, job.id)


def test_known_and_unknown_estimates_do_not_save_properties(archive):
    path, settings, _ = archive
    job = fixture.import_can(settings, path)
    cache = server.seed_suggestions(settings, job.id)
    assert json.loads(cache.read_text())["suggestions"]["mass_kg"]["value"] == 0.08
    with pytest.raises(FileExistsError):
        server.seed_suggestions(settings, job.id)
    server.seed_suggestions(settings, job.id, replace=True, unknown=True)
    saved = json.loads(cache.read_text())["suggestions"]
    assert saved["mass_kg"] is None
    assert saved["dimensions_m"] is None
    assert JobStore(settings.data_dir).get(job.id).properties is None


def test_existing_job_is_not_overwritten(archive):
    path, settings, _ = archive
    ident = uuid4()
    first = fixture.import_can(settings, path, job_id=ident)
    with pytest.raises(FileExistsError):
        fixture.import_can(settings, path, job_id=ident)
    assert JobStore(settings.data_dir).get(ident) == first


def test_historical_import_clones_saved_state_and_keeps_old_export_historical(archive, monkeypatch):
    from fastapi.testclient import TestClient

    from photo2sim.api.app import create_app

    path, settings, _ = archive
    original_id = str(uuid4())
    attempt_id = str(uuid4())
    old = {
        "id": original_id,
        "status": "completed",
        "provider": "meshy",
        "synthetic": False,
        "created_at": "2026-10-25T02:40:00Z",
        "updated_at": "2026-10-25T02:45:00Z",
        "mesh_path": "reconstruction/mesh.glb",
        "source_images": ["uploads/00.jpg"],
        "provider_task_id": "historical-task-do-not-poll",
        "properties": {
            "dimensions_m": {"x": 0.057, "y": 0.057, "z": 0.131, "source": "estimated"},
            "mass_kg": {"value": 0.26, "source": "estimated"},
        },
        "bundle_path": f"attempts/{attempt_id}/simulation.zip",
    }
    with zipfile.ZipFile(path) as bundle:
        files = {n: bundle.read(n) for n in bundle.namelist() if n != "MANIFEST.json"}
    files.update(
        {
            "original/job-before-repair.json": json.dumps(old).encode(),
            "original/attempt/simulation.zip": b"immutable old export",
        }
    )
    with zipfile.ZipFile(path, "w") as bundle:
        for name, data in files.items():
            bundle.writestr(name, data)
        bundle.writestr(
            "MANIFEST.json",
            json.dumps(
                {
                    "files": [
                        {"path": n, "bytes": len(b), "sha256": hashlib.sha256(b).hexdigest()}
                        for n, b in files.items()
                    ]
                }
            ),
        )
    monkeypatch.setattr(fixture, "ARCHIVE_SHA256", hashlib.sha256(path.read_bytes()).hexdigest())
    before = path.read_bytes()
    job = fixture.import_can(settings, path, historical_state=True)
    assert str(job.id) != original_id and job.provider_task_id is None
    assert job.status == "completed" and job.legacy_sizing_allowed
    assert job.geometry_review is None and job.properties.sizing is None
    assert job.properties.dimensions_m.z == 0.131
    root = JobStore(settings.data_dir).job_dir(job.id)
    assert (root / job.bundle_path).read_bytes() == b"immutable old export"
    assert json.loads((root / "historical/job-before-repair.json").read_text()) == old
    with TestClient(create_app(settings)) as client:
        headers = {"Authorization": "Bearer test-only"}
        assert client.post(f"/api/jobs/{job.id}/process", headers=headers).status_code == 409
        response = client.patch(
            f"/api/jobs/{job.id}/orientation",
            headers=headers,
            json={"x_deg": 0, "y_deg": 0, "z_deg": 0},
        )
        assert response.status_code == 200
        assert response.json()["bundle_path"] is None
        assert client.post(f"/api/jobs/{job.id}/process", headers=headers).status_code == 409
        assert (
            client.get(f"/api/jobs/{job.id}/files/{job.bundle_path}", headers=headers).content
            == b"immutable old export"
        )
    assert path.read_bytes() == before
