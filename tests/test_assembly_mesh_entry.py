"""Mesh-only entry preserves source bytes, explicit scale and unreviewed assumptions."""

import hashlib

import numpy as np
import pytest
import trimesh
from fastapi.testclient import TestClient

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings


def mesh_bytes():
    mesh = trimesh.creation.box(extents=[20, 40, 60])
    mesh.apply_translation([0, 0, 100])
    return mesh.export(file_type="obj").encode()


def test_mesh_entry_units_hashes_and_review_gate(tmp_path):
    raw = mesh_bytes()
    with TestClient(create_app(Settings(data_dir=tmp_path, api_token="test"))) as client:
        args = dict(
            data={"name": "panel", "units": "mm", "synthetic": "true"},
            files=[("meshes", ("body.obj", raw, "application/octet-stream"))],
        )
        assert client.post("/api/assembly-jobs/from-meshes", **args).status_code == 401
        client.headers["Authorization"] = "Bearer test"
        response = client.post("/api/assembly-jobs/from-meshes", **args)
        assert response.status_code == 202, response.text
        job = response.json()
        base = f"/api/assembly-jobs/{job['id']}"
        pack = client.get(base + "/files/" + job["package_path"]).json()
        project = pack["project"]
        assert project["synthetic"] is True
        assert not project["groups"][0]["reviewed"]
        assert project["groups"][0]["mass_kg"]["source"] == "estimated"
        assert project["groups"][0]["sliding_friction"] is None
        part = project["parts"][0]
        vertices = np.array(pack["geometry"][part["id"]]["vertices"])
        assert np.ptp(vertices, axis=0) == pytest.approx([0.02, 0.04, 0.06])
        assert vertices.mean(axis=0)[2] == pytest.approx(0.1)
        assert part["source"] == "user_supplied"
        stored = client.get(base + "/files/sources/" + part["mesh"]).content
        assert hashlib.sha256(stored).hexdigest() == part["sha256"]
        assert client.get(base + "/files/originals/body.obj").content == raw
        assert client.post(base + "/process", json={"expected_revision": 1}).status_code == 422
        assert "mm" in " ".join(project["notes"])


@pytest.mark.parametrize(
    "names,units",
    [
        (["body.obj", "body.obj"], "m"),
        (["../body.obj"], "m"),
        (["bad.zip"], "m"),
        (["body.obj"], "inch"),
    ],
)
def test_mesh_entry_rejects_ambiguous_inputs(tmp_path, names, units):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        response = client.post(
            "/api/assembly-jobs/from-meshes",
            data={"name": "test", "units": units},
            files=[("meshes", (n, mesh_bytes(), "application/octet-stream")) for n in names],
        )
        assert response.status_code == 422
        assert not list((tmp_path / "assemblies").glob("*/job.json"))


def test_mesh_entry_rejects_malformed_geometry(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        response = client.post(
            "/api/assembly-jobs/from-meshes",
            data={"name": "test", "units": "m"},
            files=[("meshes", ("broken.stl", b"not a mesh", "application/octet-stream"))],
        )
        assert response.status_code == 422
        assert not list((tmp_path / "assemblies").glob("*/job.json"))
