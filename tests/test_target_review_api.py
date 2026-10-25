"""Every new attempt requires a reviewed source/selection/orientation and re-bound sizing."""

import hashlib
from datetime import UTC, datetime
from uuid import uuid4

import pytest
import trimesh
from fastapi.testclient import TestClient
from test_pipeline import terminal
from test_sizing import uniform

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.contracts import JobRecord


class Guard:
    name = "mock"

    def submit(self, *args):
        pytest.fail("No reconstruction")

    def poll(self, *args):
        pytest.fail("No reconstruction")

    def download(self, *args):
        pytest.fail("No reconstruction")


def seed(tmp_path):
    store = JobStore(tmp_path)
    ident = uuid4()
    path = store.job_dir(ident) / "reconstruction/mesh.glb"
    path.parent.mkdir(parents=True)
    scene = trimesh.Scene()
    for size, x in [(1, -3), (3, 3), (0.5, -1.5)]:
        mesh = trimesh.creation.box(extents=[size] * 3)
        mesh.apply_translation([x, 0, 0])
        scene.add_geometry(mesh)
    scene.export(path)
    now = datetime.now(UTC)
    props = {
        "dimensions_m": {"x": 0.1, "y": 0.1, "z": 0.1, "source": "estimated"},
        "mass_kg": {"value": 0.1, "source": "estimated"},
    }
    store.create(
        JobRecord(
            id=ident,
            status="awaiting_properties",
            provider="mock",
            synthetic=True,
            created_at=now,
            updated_at=now,
            mesh_path="reconstruction/mesh.glb",
            properties=props,
        )
    )
    return ident, store, path


def review(client, ident, ids=None):
    job = client.get(f"/api/jobs/{ident}").json()
    inventory = client.get(f"/api/jobs/{ident}/geometry").json()
    response = client.patch(
        f"/api/jobs/{ident}/geometry-review",
        json={
            "source_mesh_sha256": inventory["source_mesh_sha256"],
            "island_ids": ids if ids is not None else [i["id"] for i in inventory["islands"]],
            "orientation": job["orientation"],
            "review_note": "Explicit synthetic geometry review",
            "acknowledge_geometry": True,
            "expected_input_revision": job["input_revision"],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def save_sizing(client, ident):
    job = client.get(f"/api/jobs/{ident}").json()
    props = job["properties"]
    props["sizing"] = uniform(axis="z", length=100, orientation=job["orientation"])
    props["geometry_context_sha256"] = job["geometry_review"]["geometry_context_sha256"]
    response = client.patch(f"/api/jobs/{ident}/properties", json=props)
    assert response.status_code == 200, response.text
    return response.json()


def test_unreviewed_job_does_not_start_an_attempt(tmp_path):
    ident, store, _ = seed(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path), provider=Guard())) as client:
        response = client.post(f"/api/jobs/{ident}/process")
        assert response.status_code == 409
        assert "review" in response.text.lower()
        assert store.get(ident).attempts == []


def test_manual_multiple_small_islands_prepare_and_regenerate_preserving_history(tmp_path):
    ident, store, source = seed(tmp_path)
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    with TestClient(create_app(Settings(data_dir=tmp_path), provider=Guard())) as client:
        inventory = client.get(f"/api/jobs/{ident}/geometry?preview=true").json()
        assert len(inventory["islands"]) == 3
        ids = [i["id"] for i in inventory["islands"] if i["bounds_input_units"][1][0] < 0]
        first_review = review(client, ident, ids)
        assert first_review["properties"]["geometry_context_sha256"] is None
        assert client.post(f"/api/jobs/{ident}/process").status_code == 409
        saved = save_sizing(client, ident)
        assert client.post(f"/api/jobs/{ident}/process").status_code == 202
        first = terminal(client, ident)
        zip_bytes = client.get(f"/api/jobs/{ident}/files/{first['bundle_path']}").content
        old_inputs = first["attempts"][0]["inputs"]
        assert len(old_inputs["geometry_review"]["island_ids"]) == 2
        mesh = trimesh.load_mesh(
            store.job_dir(ident) / first["export_path"].rsplit("/", 1)[0] / "meshes/visual.obj",
            process=False,
        )
        assert len(mesh.faces) == 24  # two explicitly selected parts, not the largest distractor
        second_review = review(client, ident, [ids[0]])
        assert second_review["properties"]["geometry_context_sha256"] is None
        assert second_review["sizing_result"] is None
        assert client.post(f"/api/jobs/{ident}/process").status_code == 409
        save_sizing(client, ident)
        assert client.post(f"/api/jobs/{ident}/process").status_code == 202
        second = terminal(client, ident)
        assert len(second["attempts"]) == 2
        assert second["attempts"][0]["inputs"] == old_inputs
        assert client.get(f"/api/jobs/{ident}/files/{first['bundle_path']}").content == zip_bytes
        assert second["asset"]["geometry_review"]["island_ids"] == [ids[0]]
        assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash
        assert saved["properties"]["mass_kg"]["value"] == 0.1


def test_source_and_orientation_changes_invalidate_review_and_correspondence(tmp_path):
    ident, store, source = seed(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path), provider=Guard())) as client:
        first = review(client, ident)
        save_sizing(client, ident)
        changed = client.patch(
            f"/api/jobs/{ident}/orientation", json={"x_deg": 90.0, "y_deg": 0.0, "z_deg": 0.0}
        )
        assert changed.status_code == 200
        assert changed.json()["properties"]["geometry_context_sha256"] is None
        assert client.post(f"/api/jobs/{ident}/process").status_code == 409
        review(client, ident)
        rebound = save_sizing(client, ident)
        assert (
            rebound["properties"]["geometry_context_sha256"]
            != first["geometry_review"]["geometry_context_sha256"]
        )
        source.write_bytes(trimesh.creation.box().export(file_type="glb"))
        assert client.post(f"/api/jobs/{ident}/process").status_code == 409
        assert store.get(ident).attempts == []


def test_review_rejects_empty_unknown_and_concurrent_revision(tmp_path):
    ident, _, _ = seed(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path), provider=Guard())) as client:
        job = client.get(f"/api/jobs/{ident}").json()
        inventory = client.get(f"/api/jobs/{ident}/geometry").json()
        body = {
            "source_mesh_sha256": inventory["source_mesh_sha256"],
            "island_ids": [],
            "orientation": job["orientation"],
            "review_note": "review",
            "acknowledge_geometry": True,
            "expected_input_revision": job["input_revision"],
        }
        assert client.patch(f"/api/jobs/{ident}/geometry-review", json=body).status_code == 422
        body["island_ids"] = ["f" * 64]
        assert client.patch(f"/api/jobs/{ident}/geometry-review", json=body).status_code == 422
        body["island_ids"] = [inventory["islands"][0]["id"]]
        assert client.patch(f"/api/jobs/{ident}/geometry-review", json=body).status_code == 200
        assert client.patch(f"/api/jobs/{ident}/geometry-review", json=body).status_code == 409


def test_invalid_job_identifiers_remain_validation_errors(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path), provider=Guard())) as client:
        assert client.get("/api/jobs/not-a-uuid/geometry").status_code == 422


def test_preparation_rejects_a_review_for_different_orientation(tmp_path):
    from photo2sim.assets.prepare import prepare_asset
    from photo2sim.contracts import AssetProperties, Orientation, TargetReview

    ident, _, source = seed(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path), provider=Guard())) as client:
        reviewed = review(client, ident)
        saved = save_sizing(client, ident)
        props = AssetProperties.model_validate(saved["properties"])
        props.sizing = props.sizing.model_copy(
            update={"reviewed_orientation": Orientation(x_deg=90)}
        )
        with pytest.raises(ValueError, match="[Oo]rientation"):
            prepare_asset(
                source,
                tmp_path / "mismatched-preparation",
                props,
                orientation=Orientation(x_deg=90),
                geometry_review=TargetReview.model_validate(reviewed["geometry_review"]),
            )


def test_inventory_handles_missing_optional_geometry_runtime(tmp_path, monkeypatch):
    import sys

    ident, _, _ = seed(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path), provider=Guard())) as client:
        monkeypatch.setitem(sys.modules, "photo2sim.assets.target", None)
        response = client.get(f"/api/jobs/{ident}/geometry")
        assert response.status_code == 503
        assert "dependencies" in response.text
