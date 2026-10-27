"""Rejected expensive work is not free; retained updates have independent admission."""

import time
from types import SimpleNamespace

from fastapi.testclient import TestClient
from test_access_tiers import settings
from test_assembly_jobs_api import project, upload

from photo2sim.api.app import create_app

ORIGIN = {"Origin": "https://kamino.test"}


def test_expensive_rejected_mesh_import_keeps_an_abuse_cooldown(tmp_path):
    app = create_app(settings(tmp_path, public_student_access=True))
    with TestClient(app, base_url="https://kamino.test", headers=ORIGIN) as client:
        client.post("/api/session")
        files = {"meshes": ("invalid.obj", b"not a mesh", "application/octet-stream")}
        data = {"name": "parser_abuse_fixture", "units": "m"}
        assert (
            client.post("/api/assembly-jobs/from-meshes", files=files, data=data).status_code == 422
        )
        limited = client.post("/api/assembly-jobs/from-meshes", files=files, data=data)
        assert limited.status_code == 429
        assert int(limited.headers["Retry-After"]) > 0
        assert client.get("/api/health").status_code == 200


def test_revision_puts_are_admitted_independently_of_generation(tmp_path, monkeypatch):
    # Native parser startup can exceed the cooldown on slow hosts. Keep admission
    # time deterministic while leaving session/owner clocks and subprocesses real.
    admission_time = time.time()
    monkeypatch.setattr(
        "photo2sim.api.access_limits.time", SimpleNamespace(time=lambda: admission_time)
    )
    app = create_app(settings(tmp_path, public_student_access=True))
    with TestClient(app, base_url="https://kamino.test", headers=ORIGIN) as client:
        client.post("/api/session")
        created = upload(client)
        assert created.status_code == 202
        base = f"/api/assembly-jobs/{created.json()['id']}"
        raw = project()
        first = client.put(base + "/revisions", json={"expected_revision": 1, "project": raw})
        assert first.status_code == 201
        limited = client.put(base + "/revisions", json={"expected_revision": 2, "project": raw})
        assert limited.status_code == 429
        assert client.get(base).json()["revision"] == 2


def test_large_revision_metadata_is_rejected_before_persistent_writes(tmp_path):
    app = create_app(settings(tmp_path))
    with TestClient(
        app,
        base_url="https://kamino.test",
        headers={"Authorization": "Bearer original-test-secret"},
    ) as client:
        created = upload(client)
        assert created.status_code == 202
        base = f"/api/assembly-jobs/{created.json()['id']}"
        before = client.get(base).json()
        raw = project()
        raw["notes"] = ["x" * (3 * 1024 * 1024)]
        rejected = client.put(base + "/revisions", json={"expected_revision": 1, "project": raw})
        assert rejected.status_code == 413
        assert client.get(base).json() == before
