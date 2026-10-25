"""Shared physics contract and real MuJoCo export/behavior regression coverage."""

import json
from xml.etree import ElementTree as ET

import mujoco
import numpy as np
import pytest
import trimesh
from fastapi.testclient import TestClient
from pydantic import ValidationError
from test_pipeline import seed_job, terminal
from test_simulation_export import prepared

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings
from photo2sim.assets.prepare import prepare_asset
from photo2sim.contracts import AssetProperties
from photo2sim.physics import PhysicsSettings, friction_parameters
from photo2sim.simulation.export import export_asset
from photo2sim.simulation.validate import validate_export


def with_physics(asset, physics=None, placement=None):
    data = asset.properties.model_dump(mode="json")
    data.update(physics=physics, placement_m=placement)
    asset.properties = AssetProperties.model_validate(data)
    return asset


@pytest.mark.parametrize(
    "physics",
    [
        {"collision": {"box_size_m": [1, 0, 1]}},
        {"collision": {"offset_m": [0, float("inf"), 0]}},
        {"collision": {"kind": "convex_hull", "box_size_m": [1, 1, 1]}},
        {"rolling_friction": {"value": -1, "source": "estimated"}},
        {"inertia": {"mode": "manual"}},
        {"inertia": {"mode": "manual", "diagonal_kg_m2": [1, 1, 3]}},
        {"inertia": {"mode": "manual", "diagonal_kg_m2": [0, 1, 1]}},
        {"inertia": {"mode": "manual", "diagonal_kg_m2": [1, 1, float("nan")]}},
        {"inertia": {"mode": "automatic", "center_of_mass_m": [0, 1, 0]}},
        {"contact": {"response": "exact_restitution"}},
    ],
)
def test_rejects_invalid_physics(physics):
    with pytest.raises(ValidationError):
        PhysicsSettings.model_validate(physics)


def test_rolling_only_keeps_omitted_torsional_friction_inactive(tmp_path):
    historical, dim = friction_parameters(None, 0.8)
    np.testing.assert_allclose(historical, [0.8, 0.005, 0.0001])
    assert dim == 3
    asset, root = prepared(tmp_path)
    with_physics(asset, {"rolling_friction": {"value": 0.003, "source": "estimated"}})
    scene = export_asset(asset, root, tmp_path / "rolling-only")
    model = mujoco.MjModel.from_xml_path(str(scene))
    np.testing.assert_allclose(model.geom("collision").friction, [0.8, 0, 0.003])
    assert model.geom("collision").condim == 6
    assumptions = json.loads((scene.parent / "simulation.json").read_text())
    assert assumptions["friction"] == [0.8, 0, 0.003]


@pytest.mark.parametrize("source", ["measured", "user_supplied", "sourced", "estimated"])
def test_manual_inertia_summary_retains_actual_source(tmp_path, source):
    asset, root = prepared(tmp_path)
    with_physics(
        asset, {"inertia": {"mode": "manual", "diagonal_kg_m2": [0.0001] * 3, "source": source}}
    )
    scene = export_asset(asset, root, tmp_path / "manual")
    applied = json.loads((scene.parent / "simulation.json").read_text())["inertia"]
    assert applied["source"] == source
    assert "User supplied" not in applied["note"]


def test_manual_physics_xml_placement_and_portable_validation(tmp_path):
    asset, root = prepared(tmp_path)
    physics = {
        "collision": {
            "kind": "box",
            "box_size_m": [0.03, 0.04, 0.05],
            "offset_m": [0.001, 0.002, 0.003],
        },
        "torsional_friction": {"value": 0.012, "source": "user_supplied"},
        "rolling_friction": {"value": 0.003, "source": "estimated"},
        "inertia": {
            "mode": "manual",
            "center_of_mass_m": [0.001, -0.002, 0.003],
            "diagonal_kg_m2": [0.00002, 0.00003, 0.00004],
            "source": "user_supplied",
        },
        "contact": {"compliance": "soft", "response": "medium", "source": "estimated"},
    }
    with_physics(asset, physics, [0.12, -0.08, 0.15])
    scene = export_asset(asset, root, tmp_path / "bundle")
    model = mujoco.MjModel.from_xml_path(str(scene))
    np.testing.assert_allclose(model.body("asset").pos, [0.12, -0.08, 0.15])
    np.testing.assert_allclose(model.body("asset").ipos, [0.001, -0.002, 0.003])
    np.testing.assert_allclose(model.body("asset").inertia, [0.00002, 0.00003, 0.00004])
    np.testing.assert_allclose(model.geom("collision").size, [0.015, 0.02, 0.025])
    np.testing.assert_allclose(model.geom("collision").pos, [0.001, 0.002, 0.003])
    np.testing.assert_allclose(model.geom("collision").friction, [0.8, 0.012, 0.003])
    np.testing.assert_allclose(model.geom("collision").solref, [0.02, 0.7])
    assert model.geom("collision").condim == 6
    saved = json.loads((scene.parent / "asset.json").read_text())["properties"]
    assert saved == asset.properties.model_dump(mode="json")
    report = validate_export(scene, duration_s=0.7)
    assert report["passed"], report
    assert "finite-state" in report["scope"]
    assert report["original"]["checks"] == {"finite_state": True, "no_warnings": True}


def test_automatic_collision_box_com_and_legacy_defaults(tmp_path):
    asset, root = prepared(tmp_path)
    legacy = export_asset(asset, root, tmp_path / "legacy")
    model = mujoco.MjModel.from_xml_path(str(legacy))
    assert model.geom("collision").condim == 3
    np.testing.assert_allclose(model.geom("collision").solref, [0.002, 1])
    np.testing.assert_allclose(model.body("asset").pos, [0, 0, 0.05])
    with_physics(
        asset, {"collision": {"box_size_m": [0.03, 0.04, 0.05], "offset_m": [0.001, 0.002, 0.003]}}
    )
    scene = export_asset(asset, root, tmp_path / "explicit")
    model = mujoco.MjModel.from_xml_path(str(scene))
    np.testing.assert_allclose(model.body("asset").ipos, [0.001, 0.002, 0.003])
    sides = np.array([0.03, 0.04, 0.05])
    np.testing.assert_allclose(model.body("asset").inertia, 0.08 * (sum(sides**2) - sides**2) / 12)
    assert (legacy.parent / "simulation.json").read_text().find("photo2sim-box-export/1") >= 0


def test_real_convex_hull_uses_mesh_shape_and_exports_relocatably(tmp_path):
    # A tetrahedron occupies one sixth of its bounding cuboid, so a box substitute fails.
    source = tmp_path / "tetra.obj"
    mesh = trimesh.Trimesh(
        vertices=[[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
        faces=[[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]],
        process=True,
    )
    mesh.export(source)
    props = AssetProperties(
        dimensions_m={"x": 0.04, "y": 0.05, "z": 0.06, "source": "estimated"},
        mass_kg={"value": 0.08, "source": "estimated"},
        physics={"collision": {"kind": "convex_hull", "offset_m": [0.001, -0.002, 0.003]}},
    )
    asset = prepare_asset(source, tmp_path / "prepared", props)
    hull = trimesh.load_mesh(tmp_path / "prepared" / asset.collision.mesh_path)
    assert hull.volume == pytest.approx(0.04 * 0.05 * 0.06 / 6)
    scene = export_asset(asset, tmp_path / "prepared", tmp_path / "bundle")
    model = mujoco.MjModel.from_xml_path(str(scene))
    assert model.geom("collision").type == mujoco.mjtGeom.mjGEOM_MESH
    assert model.mesh_vertnum[model.geom("collision").dataid[0]] == 4
    report = validate_export(scene, duration_s=0.7)
    assert report["passed"], report
    assert "not measured inertia" in (scene.parent / "simulation.json").read_text()


@pytest.mark.parametrize("tamper", ["offset", "vertices", "scale"])
def test_convex_validation_rejects_changed_compiled_shape_or_offset(tmp_path, tamper):
    asset, root = prepared(tmp_path)
    with_physics(asset, {"collision": {"kind": "convex_hull", "offset_m": [0.001, 0.002, 0.003]}})
    convex = prepare_asset(root / asset.visual_mesh, tmp_path / "hull", asset.properties)
    scene = export_asset(convex, tmp_path / "hull", tmp_path / "bundle")
    if tamper == "vertices":
        path = scene.parent / convex.collision.mesh_path
        mesh = trimesh.load_mesh(path)
        mesh.vertices[:, 0] *= 2
        mesh.export(path)
    else:
        tree = ET.parse(scene)
        if tamper == "offset":
            tree.find(".//geom[@name='collision']").set("pos", "1 0 0")
        else:
            tree.find(".//mesh[@name='prepared_collision']").set("scale", "2 1 1")
        tree.write(scene)
    report = validate_export(scene, duration_s=0.6)
    assert report["passed"] is False
    assert "Compiled convex collision geometry or offset" in report["original"]["error"]
    assert report["portability_passed"] is False


def test_manual_inertia_changes_measured_angular_acceleration(tmp_path):
    asset, root = prepared(tmp_path)
    acceleration = []
    for multiplier in [1, 2]:
        with_physics(
            asset,
            {"inertia": {"mode": "manual", "diagonal_kg_m2": [0.0001 * multiplier] * 3}},
            [0, 0, 1],
        )
        scene = export_asset(asset, root, tmp_path / f"inertia-{multiplier}")
        model = mujoco.MjModel.from_xml_path(str(scene))
        data = mujoco.MjData(model)
        data.qfrc_applied[5] = 0.001
        mujoco.mj_forward(model, data)
        acceleration.append(data.qacc[5])
    assert acceleration[0] == pytest.approx(2 * acceleration[1])


def test_spin_and_contact_response_change_real_simulation(tmp_path):
    # Keep tangential contact torque small so the torsional term can be isolated.
    asset, root = prepared(tmp_path, friction={"value": 0.001, "source": "estimated"})
    results = {}
    for name, spin, response in [("zero", 0, "low"), ("spin", 0.002, "low"), ("bounce", 0, "high")]:
        with_physics(
            asset,
            {
                "torsional_friction": {"value": spin, "source": "estimated"},
                "contact": {"compliance": "firm", "response": response},
            },
        )
        scene = export_asset(asset, root, tmp_path / name)
        model = mujoco.MjModel.from_xml_path(str(scene))
        data = mujoco.MjData(model)
        data.qvel[5] = 2
        upward = 0
        for _ in range(4000):
            mujoco.mj_step(model, data)
            upward = max(upward, float(data.qvel[2]))
        results[name] = (abs(float(data.qvel[5])), upward)
        assert not sum(w.number for w in data.warning)
    assert results["spin"][0] < results["zero"][0] * 0.5
    assert results["bounce"][1] > results["zero"][1] + 0.02


def test_saved_physics_reopen_process_and_previous_export_immutability(tmp_path):
    job_id, _ = seed_job(tmp_path)
    settings = Settings(data_dir=tmp_path)
    with TestClient(create_app(settings)) as client:
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        first = terminal(client, job_id)
        assert first["status"] == "completed", first
        old_bytes = client.get(f"/api/jobs/{job_id}/files/{first['bundle_path']}").content
        props = first["properties"]
        props.update(
            physics={
                "collision": {"kind": "convex_hull"},
                "rolling_friction": {"value": 0.001, "source": "user_supplied"},
            },
            placement_m=[0.1, 0.02, 0.12],
        )
        saved = client.patch(f"/api/jobs/{job_id}/properties", json=props)
        assert saved.status_code == 200, saved.text
        expected = saved.json()["properties"]
    with TestClient(create_app(settings)) as client:
        assert client.get(f"/api/jobs/{job_id}").json()["properties"] == expected
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        second = terminal(client, job_id)
        assert second["status"] == "completed", second
        assert second["attempts"][-1]["inputs"]["properties"] == expected
        assert second["attempts"][0]["inputs"]["properties"]["physics"] is None
        assert client.get(f"/api/jobs/{job_id}/files/{first['bundle_path']}").content == old_bytes
