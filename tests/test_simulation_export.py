import json
from pathlib import Path
from uuid import uuid4
from xml.etree import ElementTree as ET

import mujoco
import numpy as np
import pytest
import trimesh

from photo2sim.contracts import AssetRecord, CollisionGeometry
from photo2sim.simulation.export import export_asset
from photo2sim.simulation.validate import validate_export


def prepared(tmp_path, dimensions=(0.04, 0.05, 0.06), mass=0.08, friction=None):
    root = tmp_path / "prepared"
    (root / "meshes").mkdir(parents=True)
    trimesh.creation.box(extents=dimensions).export(root / "meshes/visual.obj")
    asset = AssetRecord(
        asset_id=uuid4(),
        visual_mesh="meshes/visual.obj",
        synthetic=True,
        properties={
            "dimensions_m": dict(
                zip(("x", "y", "z"), dimensions),
                source="estimated",
                note="Synthetic design, not measured",
            ),
            "mass_kg": {"value": mass, "source": "estimated", "note": "Synthetic assumed mass"},
            "sliding_friction": friction,
        },
        collision={"kind": "box"},
        notes=["Synthetic prepared mesh in metres"],
    )
    return asset, root


@pytest.mark.parametrize(
    "dimensions,mass",
    [((0.04, 0.04, 0.04), 0.05), ((0.12, 0.08, 0.025), 0.35), ((0.035, 0.045, 0.1), 0.12)],
)
def test_export_dimensions_provenance_dynamics_and_relocation(tmp_path, dimensions, mass):
    asset, source = prepared(tmp_path, dimensions, mass)
    original = (source / asset.visual_mesh).read_bytes()
    scene = export_asset(asset, source, tmp_path / "bundle")
    assert scene.name == "scene.xml"
    assert (source / asset.visual_mesh).read_bytes() == original
    assert (scene.parent / asset.visual_mesh).read_bytes() == original
    copied_asset = AssetRecord.model_validate_json((scene.parent / "asset.json").read_text())
    assert copied_asset == asset
    assumptions = json.loads((scene.parent / "simulation.json").read_text())
    assert copied_asset.properties.sliding_friction is None
    assert assumptions["sliding_friction_source"] == "simulation_default_not_measured"
    model = mujoco.MjModel.from_xml_path(str(scene))
    body = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, "asset")
    collision = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "collision")
    assert model.body_mass[body] == pytest.approx(mass)
    np.testing.assert_allclose(model.geom_size[collision], np.array(dimensions) / 2)
    report = validate_export(scene)
    assert report["passed"], report
    assert report["portability_passed"]
    assert report["original"]["first_ground_contact_s"] > 0
    assert report["original"]["simulation_wall_clock_s"] > 0
    assert report["original"]["simulated_duration_s"] == pytest.approx(3)
    assert not report["viewer_inspected"]
    json.dumps(report)  # Report must be directly usable by an API/job worker.


def test_zero_confirmed_friction_and_nonsynthetic_label_are_preserved(tmp_path):
    asset, root = prepared(
        tmp_path, friction={"value": 0, "source": "user_supplied", "note": "Operator input"}
    )
    asset.synthetic = False
    scene = export_asset(asset, root, tmp_path / "bundle")
    properties = json.loads((scene.parent / "asset.json").read_text())
    assumptions = json.loads((scene.parent / "simulation.json").read_text())
    assert properties["synthetic"] is False
    assert properties["properties"]["sliding_friction"]["note"] == "Operator input"
    assert assumptions["friction"][0] == 0
    assert assumptions["sliding_friction_source"] == "user_supplied"


def test_existing_output_is_never_overwritten(tmp_path):
    asset, root = prepared(tmp_path)
    output = tmp_path / "bundle"
    output.mkdir()
    (output / "keep.txt").write_text("keep")
    with pytest.raises(FileExistsError):
        export_asset(asset, root, output)
    assert (output / "keep.txt").read_text() == "keep"


@pytest.mark.parametrize(
    "fault",
    [
        "missing",
        "wrong_scale",
        "off_centre",
        "invalid_obj",
        "external_material",
        "unsupported_format",
        "traversal",
        "unsupported_collision",
    ],
)
def test_invalid_prepared_inputs_do_not_publish_a_bundle(tmp_path, fault):
    asset, root = prepared(tmp_path)
    mesh = root / asset.visual_mesh
    if fault == "missing":
        mesh.unlink()
    elif fault == "wrong_scale":
        trimesh.creation.box(extents=(40, 50, 60)).export(mesh)
    elif fault == "off_centre":
        geometry = trimesh.creation.box(extents=(0.04, 0.05, 0.06))
        geometry.apply_translation((0.1, 0, 0))
        geometry.export(mesh)
    elif fault == "invalid_obj":
        mesh.write_text("not a mesh")
    elif fault == "external_material":
        mesh.write_text("mtllib ../../private.mtl\n" + mesh.read_text())
    elif fault == "unsupported_format":
        asset.visual_mesh = "meshes/visual.glb"
        (root / asset.visual_mesh).write_bytes(b"not a prepared OBJ/STL")
    elif fault == "traversal":
        asset.visual_mesh = "../outside.obj"
    else:
        asset.collision = CollisionGeometry(kind="convex_mesh", mesh_path="meshes/collision.obj")
    output = tmp_path / "bundle"
    with pytest.raises((ValueError, FileNotFoundError, NotImplementedError)):
        export_asset(asset, root, output)
    assert not output.exists()


def test_symlink_cannot_escape_asset_root(tmp_path):
    asset, root = prepared(tmp_path)
    outside = tmp_path / "outside.obj"
    outside.write_bytes((root / asset.visual_mesh).read_bytes())
    link = root / "meshes/link.obj"
    try:
        link.symlink_to(outside)
    except OSError:
        pytest.skip("Host does not permit test symlinks")
    asset.visual_mesh = "meshes/link.obj"
    with pytest.raises(ValueError, match="escapes"):
        export_asset(asset, root, tmp_path / "bundle")


def test_compile_failure_cleans_staging_and_preserves_source(tmp_path, monkeypatch):
    from photo2sim.simulation import export

    asset, root = prepared(tmp_path)
    original = (root / asset.visual_mesh).read_bytes()
    monkeypatch.setattr(
        export,
        "_write_scene",
        lambda asset, folder, settings: (folder / "scene.xml").write_text("broken XML"),
    )
    with pytest.raises(ValueError):
        export_asset(asset, root, tmp_path / "bundle")
    assert not (tmp_path / "bundle").exists()
    assert not list(tmp_path.glob(".photo2sim-export-*"))
    assert (root / asset.visual_mesh).read_bytes() == original


@pytest.mark.parametrize("fault", ["visual_scale", "mass", "no_contact", "asset_directory"])
def test_reusable_validator_rejects_corrupted_exports(tmp_path, fault):
    asset, root = prepared(tmp_path)
    scene = export_asset(asset, root, tmp_path / "bundle")
    tree = ET.parse(scene)
    if fault == "visual_scale":
        tree.find("asset/mesh").set("scale", "0.001 0.001 0.001")
    elif fault == "mass":
        tree.find("worldbody/body/inertial").set("mass", "2")
    elif fault == "asset_directory":
        tree.find("compiler").set("meshdir", "../outside")
    else:
        ground = tree.find("worldbody/geom")
        ground.set("contype", "0")
        ground.set("conaffinity", "0")
    tree.write(scene)
    report = validate_export(scene, duration_s=0.6, check_portability=False)
    assert not report["passed"]
    if fault == "no_contact":
        assert not report["original"]["checks"]["ground_contact"]


def test_validator_rejects_invalid_duration(tmp_path):
    with pytest.raises(ValueError, match="Duration"):
        validate_export(Path(tmp_path / "absent.xml"), duration_s=float("nan"))
