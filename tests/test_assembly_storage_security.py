"""Assembly evidence is retained only after storage admission succeeds."""

import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from photo2sim.api.app import create_app
from photo2sim.api.assembly_jobs import AssemblyJobs
from photo2sim.api.config import Settings
from photo2sim.api.storage import StorageBudget, StorageLimitError
from photo2sim.assemblies.review import ReviewProject

FIXTURE = Path(__file__).resolve().parents[1] / "examples/assemblies/two-link-hinge/input"


def _project_and_uploads():
    # The full API fixture is deliberately not needed here: this is a retained-write
    # admission test and uses a minimal valid one-mesh review project.
    mesh = (FIXTURE / "meshes/base.obj").read_bytes()
    project = ReviewProject.model_validate(
        {
            "name": "storage-fixture",
            "synthetic": True,
            "root_link": "base",
            "parts": [
                {
                    "id": "base",
                    "mesh": "base.obj",
                    "sha256": hashlib.sha256(mesh).hexdigest(),
                    "source": "estimated",
                    "note": "Storage test",
                    "group": "base",
                }
            ],
            "groups": [{"name": "base", "mass_kg": {"value": 1, "source": "estimated"}}],
            "joints": [],
        }
    )
    return project, {"base.obj": mesh}


def test_rejected_new_assembly_does_not_leave_partial_sources_or_revision(tmp_path):
    project, uploads = _project_and_uploads()
    service = AssemblyJobs(
        tmp_path,
        storage=StorageBudget(tmp_path, max_total_bytes=1, max_job_bytes=1, min_free_bytes=0),
    )
    with pytest.raises(StorageLimitError):
        service.create(project, uploads)
    assert list((tmp_path / "assemblies").glob("*/job.json")) == []
    assert list((tmp_path / "assemblies").glob("*/sources")) == []


def test_processing_claim_checks_hashes_without_reparsing_cached_geometry(tmp_path, monkeypatch):
    from uuid import UUID

    from photo2sim.api.assembly_jobs import ProcessRequest
    from photo2sim.assemblies.review import review_snapshot

    project, uploads = _project_and_uploads()
    project.groups[0].reviewed = True
    project.groups[0].review_note = "Synthetic source reviewed"
    project.review_snapshot = review_snapshot(project)
    service = AssemblyJobs(tmp_path)
    try:
        job = service.create(project, uploads)
        monkeypatch.setattr(
            "trimesh.load_mesh",
            lambda *a, **k: (_ for _ in ()).throw(
                AssertionError("Native geometry parsing must not precede the processing claim")
            ),
        )
        monkeypatch.setattr(service.executor, "submit", lambda *a, **k: None)
        result = service.start(UUID(job["id"]), ProcessRequest(expected_revision=1))
        assert result["status"] == "preparing"
        assert len(result["attempts"]) == 1
    finally:
        service.close()


def test_changed_cached_source_is_rejected_before_a_processing_claim(tmp_path):
    from uuid import UUID

    from photo2sim.api.assembly_jobs import ProcessRequest
    from photo2sim.assemblies.review import review_snapshot

    project, uploads = _project_and_uploads()
    project.groups[0].reviewed = True
    project.groups[0].review_note = "Synthetic source reviewed"
    project.review_snapshot = review_snapshot(project)
    service = AssemblyJobs(tmp_path)
    try:
        job = service.create(project, uploads)
        ident = UUID(job["id"])
        (service.directory(ident) / "sources/base.obj").write_bytes(b"changed source")
        with pytest.raises(ValueError, match="Source changed"):
            service.start(ident, ProcessRequest(expected_revision=1))
        assert service.get(ident)["attempts"] == []
    finally:
        service.close()


def test_validation_exception_publishes_a_downloadable_failed_attempt(tmp_path, monkeypatch):
    """A failed validator must not leave the claimed attempt stuck in progress."""

    from test_assembly_jobs_api import finished, project, upload

    from photo2sim.assemblies.review import ReviewProject, review_snapshot

    raw = project()
    parsed = ReviewProject.model_validate(raw)
    parsed.review_snapshot = review_snapshot(parsed)
    monkeypatch.setattr(
        "photo2sim.api.assembly_jobs.validate_assembly",
        lambda scene: (_ for _ in ()).throw(RuntimeError("validator exploded")),
    )
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        created = upload(client, parsed.model_dump(mode="json"))
        assert created.status_code == 202
        base = f"/api/assembly-jobs/{created.json()['id']}"
        assert client.post(base + "/process", json={"expected_revision": 1}).status_code == 202
        failed = finished(client, created.json()["id"])
        assert failed["status"] == "failed"
        assert failed["validation_path"]
        assert client.get(base + "/files/" + failed["validation_path"]).status_code == 200
