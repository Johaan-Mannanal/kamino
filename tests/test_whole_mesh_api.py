"""Whole-reconstruction sizing/export needs no per-surface user review."""

import hashlib

import pytest
import trimesh
from fastapi.testclient import TestClient
from test_pipeline import terminal
from test_sizing import uniform
from test_target_review_api import Guard, review, save_sizing, seed

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings


def save_whole(client, ident):
    job = client.get(f"/api/jobs/{ident}").json()
    sizing = uniform(axis="z", length=100, orientation=job["orientation"])
    result = client.post(
        f"/api/jobs/{ident}/sizing-preview",
        json={
            "sizing": sizing,
            "orientation": job["orientation"],
            "geometry_scope": "whole_reconstruction",
        },
    )
    assert result.status_code == 200, result.text
    preview = result.json()
    assert len(preview["source_mesh_sha256"]) == 64
    props = {
        "geometry_scope": "whole_reconstruction",
        "source_mesh_sha256": preview["source_mesh_sha256"],
        "geometry_context_sha256": preview["geometry_context_sha256"],
        "dimensions_m": preview["dimensions_m"],
        "mass_kg": {"value": 0.1, "source": "estimated"},
        "sliding_friction": None,
        "sizing": sizing,
    }
    saved = client.patch(f"/api/jobs/{ident}/properties", json=props)
    assert saved.status_code == 200, saved.text
    return saved.json()


def test_whole_reconstruction_exports_every_component_without_selection_review(tmp_path):
    ident, store, source = seed(tmp_path)
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    with TestClient(create_app(Settings(data_dir=tmp_path), provider=Guard())) as client:
        saved = save_whole(client, ident)
        assert saved["geometry_review"] is None
        assert saved["properties"]["source_mesh_sha256"] == source_hash
        assert saved["properties"]["dimensions_m"]["x"] == pytest.approx(8 / 30)
        assert client.post(f"/api/jobs/{ident}/process").status_code == 202
        completed = terminal(client, ident)
        assert completed["status"] == "completed", completed["error"]
        inputs = completed["attempts"][0]["inputs"]
        assert inputs["geometry_review"] is None
        assert inputs["properties"]["geometry_scope"] == "whole_reconstruction"
        visual = (
            store.job_dir(ident) / completed["export_path"].rsplit("/", 1)[0] / "meshes/visual.obj"
        )
        assert len(trimesh.load_mesh(visual, process=False).faces) == 36
        assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash


def test_whole_scope_replaces_current_selection_but_retains_previous_exports(tmp_path):
    ident, store, _ = seed(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path), provider=Guard())) as client:
        inventory = client.get(f"/api/jobs/{ident}/geometry").json()
        review(client, ident, [inventory["islands"][0]["id"]])
        save_sizing(client, ident)
        assert client.post(f"/api/jobs/{ident}/process").status_code == 202
        old = terminal(client, ident)
        old_inputs = old["attempts"][0]["inputs"]
        old_zip = client.get(f"/api/jobs/{ident}/files/{old['bundle_path']}").content
        new = save_whole(client, ident)
        assert new["geometry_review"] is None
        assert client.post(f"/api/jobs/{ident}/process").status_code == 202
        new = terminal(client, ident)
        assert new["status"] == "completed"
        assert new["attempts"][0]["inputs"] == old_inputs
        assert client.get(f"/api/jobs/{ident}/files/{old['bundle_path']}").content == old_zip
        assert new["attempts"][-1]["inputs"]["geometry_review"] is None


def test_source_or_orientation_changes_require_fresh_whole_mesh_sizing(tmp_path):
    ident, store, source = seed(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path), provider=Guard())) as client:
        saved = save_whole(client, ident)
        changed = client.patch(
            f"/api/jobs/{ident}/orientation", json={"x_deg": 90, "y_deg": 0, "z_deg": 0}
        )
        assert changed.status_code == 200
        assert client.post(f"/api/jobs/{ident}/process").status_code == 409
        save_whole(client, ident)
        source.write_bytes(trimesh.creation.box().export(file_type="glb"))
        assert client.post(f"/api/jobs/{ident}/process").status_code == 409
        assert store.get(ident).attempts == []
        assert (
            client.patch(f"/api/jobs/{ident}/properties", json=saved["properties"]).status_code
            == 409
        )


def test_legacy_job_still_requires_explicit_sizing_to_switch_to_whole_mesh(tmp_path):
    ident, store, _ = seed(tmp_path)
    store.update(ident, legacy_sizing_allowed=True)
    with TestClient(create_app(Settings(data_dir=tmp_path), provider=Guard())) as client:
        props = client.get(f"/api/jobs/{ident}").json()["properties"]
        props["geometry_scope"] = "whole_reconstruction"
        assert client.patch(f"/api/jobs/{ident}/properties", json=props).status_code == 422
        assert store.get(ident).properties.geometry_scope == "reviewed_target"
