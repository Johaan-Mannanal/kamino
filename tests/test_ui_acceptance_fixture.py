import hashlib
import io
import json
import zipfile
from uuid import uuid4

import pytest

from photo2sim.api.store import JobStore
from tools import ui_acceptance_fixture as fixture
from tools import ui_acceptance_server as server


@pytest.fixture
def archive(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "ACCEPTANCE_ROOT", tmp_path)
    payload = {
        "original/reconstruction/mesh.glb": b"test raw geometry",
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
