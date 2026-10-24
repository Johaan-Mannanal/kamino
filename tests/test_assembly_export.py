"""Actual MuJoCo loading, transforms, motion, portability and export failures."""

import json
import math
import shutil
from xml.etree import ElementTree as ET

import mujoco
import pytest
import trimesh
from test_assemblies import assembly_input

from photo2sim.assemblies.contracts import AssemblyRecord


@pytest.fixture
def prepared(tmp_path):
    source = tmp_path / "input"
    (source / "meshes").mkdir(parents=True)
    base = trimesh.creation.box(extents=[0.06, 0.06, 0.08])
    arm = trimesh.creation.box(extents=[0.20, 0.025, 0.025])
    arm.apply_translation([0.10, 0, 0])
    base.export(source / "meshes/base.obj")
    arm.export(source / "meshes/arm.obj")
    return AssemblyRecord.model_validate(assembly_input()), source


def export(record, source, dest):
    from photo2sim.assemblies.export import export_assembly

    return export_assembly(record, source, dest)


def validate(scene, **kwargs):
    from photo2sim.assemblies.validate import validate_assembly

    return validate_assembly(scene, **kwargs)


def test_export_preserves_geometry_provenance_and_fk(prepared, tmp_path):
    a, src = prepared
    scene = export(a, src, tmp_path / "bundle")
    saved = AssemblyRecord.model_validate_json((scene.parent / "assembly.json").read_text())
    assert saved == a
    assumptions = json.loads((scene.parent / "simulation.json").read_text())
    assert assumptions["collision"] == "per-link axis-aligned bounding boxes"
    assert "uniform" in assumptions["inertia"]
    assert saved.links[0].sliding_friction is None
    model = mujoco.MjModel.from_xml_path(str(scene))
    assert (model.nbody, model.njnt, model.nu) == (3, 1, 1)
    data = mujoco.MjData(model)
    q = model.joint("hinge").qposadr[0]
    data.qpos[q] = math.pi / 2
    mujoco.mj_forward(model, data)
    collision = model.geom("collision_arm").id
    # Mesh is offset 10 cm from hinge; it must not be recentered.
    assert data.geom_xpos[collision] == pytest.approx([0, 0.10, 0.31], abs=1e-7)
    assert model.body("arm").mass == pytest.approx(0.1)
    assert model.body("arm").ipos == pytest.approx([0.1, 0, 0])
    assert (scene.parent / "meshes/arm.obj").read_bytes() == (src / "meshes/arm.obj").read_bytes()


def test_rotated_root_and_joint_frames(prepared, tmp_path):
    a, src = prepared
    d = a.model_dump()
    d["root_pose"]["quaternion_wxyz"] = [math.sqrt(0.5), 0, 0, math.sqrt(0.5)]
    d["joints"][0]["origin"] = {
        "position_m": [0.1, 0, 0.06],
        "quaternion_wxyz": [math.sqrt(0.5), math.sqrt(0.5), 0, 0],
    }
    a = AssemblyRecord.model_validate(d)
    scene = export(a, src, tmp_path / "rotated")
    m = mujoco.MjModel.from_xml_path(str(scene))
    data = mujoco.MjData(m)
    data.qpos[0] = math.pi / 2
    mujoco.mj_forward(m, data)
    assert data.xanchor[0] == pytest.approx([0, 0.1, 0.31], abs=1e-7)
    assert data.xaxis[0] == pytest.approx([1, 0, 0], abs=1e-7)
    assert data.geom_xpos[m.geom("collision_arm").id] == pytest.approx([0, 0.1, 0.41], abs=1e-7)


def test_fixed_tree_and_input_order(prepared, tmp_path):
    a, src = prepared
    d = a.model_dump()
    d["links"].reverse()
    d["joints"][0] = {
        "name": "fixed",
        "kind": "fixed",
        "parent": "base",
        "child": "arm",
        "source": "user_supplied",
    }
    scene = export(AssemblyRecord.model_validate(d), src, tmp_path / "fixed")
    m = mujoco.MjModel.from_xml_path(str(scene))
    assert m.njnt == 0
    assert m.body("arm").parentid == m.body("base").id
    report = validate(scene)
    assert not report["passed"]
    assert "driven" in report["error"].lower()


def test_motion_reset_and_relocation(prepared, tmp_path):
    a, src = prepared
    scene = export(a, src, tmp_path / "dynamic")
    report = validate(scene)
    assert report["passed"], report
    assert report["original"]["passed"] and report["relocated"]["passed"]
    assert report["original"]["reset_repeatable"]
    assert report["original"]["warnings"] == 0
    assert report["original"]["max_tracking_error_rad"] < 0.03
    phases = report["original"]["trials"][0]["phases"]
    assert any(p["actual_rad"] > 0.3 for p in phases)
    assert any(p["actual_rad"] < -0.3 for p in phases)
    relocated = tmp_path / "elsewhere"
    shutil.copytree(scene.parent, relocated)
    assert validate(relocated / "scene.xml", check_portability=False)["passed"]


def test_tracking_failure_is_not_success(prepared, tmp_path):
    a, src = prepared
    scene = export(a, src, tmp_path / "stalled")
    tree = ET.parse(scene)
    actuator = tree.find("./actuator/position")
    actuator.set("kp", "0")
    tree.write(scene)
    report = validate(scene, check_portability=False)
    assert not report["passed"]
    assert not report["original"]["passed"]


def test_existing_output_is_preserved(prepared, tmp_path):
    a, src = prepared
    dest = tmp_path / "existing"
    dest.mkdir()
    (dest / "keep.txt").write_text("keep")
    with pytest.raises(FileExistsError):
        export(a, src, dest)
    assert (dest / "keep.txt").read_text() == "keep"


@pytest.mark.parametrize("case", ["empty", "flat", "nan", "material", "missing", "outside_symlink"])
def test_rejects_bad_inputs_without_publishing(prepared, tmp_path, case):
    a, src = prepared
    path = src / "meshes/arm.obj"
    if case == "empty":
        path.write_text("")
    elif case == "flat":
        path.write_text("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")
    elif case == "nan":
        path.write_text("v nan 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 3\nf 1 3 4\n")
    elif case == "material":
        path.write_text("mtllib ../../secret.mtl\n" + path.read_text())
    elif case == "missing":
        path.unlink()
    else:
        outside = tmp_path / "outside.obj"
        outside.write_bytes(path.read_bytes())
        path.unlink()
        try:
            path.symlink_to(outside)
        except OSError:
            pytest.skip("Symlink privileges unavailable")
    with pytest.raises((ValueError, FileNotFoundError, NotImplementedError)):
        export(a, src, tmp_path / "bad")
    assert not (tmp_path / "bad").exists()


def test_compile_failure_report(tmp_path):
    scene = tmp_path / "broken.xml"
    scene.write_text("<mujoco><broken/></mujoco>")
    report = validate(scene)
    assert not report["passed"]
    assert "error" in report


def test_branched_multijoint_assembly(prepared, tmp_path):
    a, src = prepared
    d = a.model_dump()
    d["links"].append({**d["links"][1], "name": "branch"})
    d["joints"].append(
        {
            **d["joints"][0],
            "name": "branch_hinge",
            "child": "branch",
            "origin": {"position_m": [0, 0, 0.12]},
        }
    )
    scene = export(AssemblyRecord.model_validate(d), src, tmp_path / "branched")
    m = mujoco.MjModel.from_xml_path(str(scene))
    assert m.nu == 2
    assert validate(scene)["passed"]


def test_cli_export_validate_and_no_overwrite(prepared, tmp_path):
    import subprocess
    import sys

    a, src = prepared
    record = src / "assembly.json"
    record.write_text(a.model_dump_json())
    destination = tmp_path / "cli"
    command = [
        sys.executable,
        "-m",
        "photo2sim.assemblies",
        "export",
        str(record),
        "--output-dir",
        str(destination),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert json.loads((destination / "validation.json").read_text())["passed"]
    again = subprocess.run(command, capture_output=True, text=True)
    assert again.returncode != 0
    report = tmp_path / "separate-report.json"
    check = subprocess.run(
        [
            sys.executable,
            "-m",
            "photo2sim.assemblies",
            "validate",
            str(destination / "scene.xml"),
            "--report",
            str(report),
        ],
        capture_output=True,
        text=True,
    )
    assert check.returncode == 0, check.stderr
    assert json.loads(report.read_text())["passed"]


def test_cli_validation_failure_retains_bundle(prepared, tmp_path):
    import subprocess
    import sys

    a, src = prepared
    d = a.model_dump()
    d["joints"][0]["drive"]["kp"] = 1e-9
    record = src / "assembly.json"
    record.write_text(json.dumps(d))
    destination = tmp_path / "failed-cli"
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "photo2sim.assemblies",
            "export",
            str(record),
            "--output-dir",
            str(destination),
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1
    assert (destination / "scene.xml").is_file()
    assert not json.loads((destination / "validation.json").read_text())["passed"]


@pytest.mark.parametrize("case", ["axis", "origin", "mass", "gain", "gravity", "collision"])
def test_validation_rejects_scene_disagreeing_with_reviewed_record(prepared, tmp_path, case):
    a, src = prepared
    scene = export(a, src, tmp_path / case)
    tree = ET.parse(scene)
    if case == "axis":
        tree.find(".//joint").set("axis", "0 1 0")
    elif case == "origin":
        tree.find(".//body[@name='arm']").set("pos", "0 0 .5")
    elif case == "mass":
        tree.find(".//body[@name='arm']/inertial").set("mass", ".2")
    elif case == "gain":
        tree.find("./actuator/position").set("kp", "10")
    elif case == "gravity":
        tree.find("./option").set("gravity", "0 0 0")
    else:
        tree.find(".//geom[@name='collision_arm']").set("size", ".2 .02 .02")
    tree.write(scene)
    report = validate(scene, check_portability=False)
    assert not report["passed"], report


def test_bundle_is_a_reusable_input(prepared, tmp_path):
    a, src = prepared
    d = a.model_dump()
    # Input paths need not match link names or the default meshes directory.
    (src / "parts").mkdir()
    shutil.copyfile(src / "meshes/arm.obj", src / "parts/custom.obj")
    d["links"][1]["visual_mesh"] = "parts/custom.obj"
    a = AssemblyRecord.model_validate(d)
    scene = export(a, src, tmp_path / "first")
    second = export(a, scene.parent, tmp_path / "second")
    assert validate(second)["passed"]


def test_validation_rejects_substituted_mesh_with_same_bounds(prepared, tmp_path):
    a, src = prepared
    scene = export(a, src, tmp_path / "impostor")
    # A tetrahedron has the same AABB as the arm box but different geometry.
    fake = trimesh.Trimesh(
        vertices=[
            [0, -0.0125, -0.0125],
            [0.2, 0.0125, -0.0125],
            [0, 0.0125, 0.0125],
            [0.2, -0.0125, 0.0125],
        ],
        faces=[[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
    )
    fake.export(scene.parent / "meshes/impostor.obj")
    tree = ET.parse(scene)
    tree.find("./asset/mesh[@name='mesh_arm']").set("file", "meshes/impostor.obj")
    tree.write(scene)
    assert not validate(scene, check_portability=False)["passed"]


def test_convex_collision_and_explicit_joint_exclusion(prepared, tmp_path):
    from photo2sim.assemblies.export import export_assembly

    a, src = prepared
    # Deliberately overlapping joint-adjacent housings at a fixed root.
    a.joints[0].origin.position_m = (0, 0, 0)
    scene = export_assembly(
        a, src, tmp_path / "convex", collision_mode="convex_mesh", exclude_joint_pairs=True
    )
    m = mujoco.MjModel.from_xml_path(str(scene))
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    assert d.ncon == 0
    assert m.geom("collision_arm").type[0] == mujoco.mjtGeom.mjGEOM_MESH
    assert m.geom("collision_arm").contype[0] == 1
    assert m.geom("ground").contype[0] == 1
    assert validate(scene)["passed"]
    # A separate grounded scenario must still produce real contacts.
    a.root_pose.position_m = (0, 0, 0)
    low = export_assembly(
        a, src, tmp_path / "low", collision_mode="convex_mesh", exclude_joint_pairs=True
    )
    lm = mujoco.MjModel.from_xml_path(str(low))
    ld = mujoco.MjData(lm)
    mujoco.mj_forward(lm, ld)
    ground = lm.geom("ground").id
    assert any(ground in (c.geom1, c.geom2) for c in ld.contact)


@pytest.mark.parametrize(
    "tamper", ["extra_exclusion", "disabled_ground", "disabled_contacts", "collision_transform"]
)
def test_convex_policy_cannot_hide_contacts(prepared, tmp_path, tamper):
    from photo2sim.assemblies.export import export_assembly

    a, src = prepared
    scene = export_assembly(
        a, src, tmp_path / tamper, collision_mode="convex_mesh", exclude_joint_pairs=True
    )
    tree = ET.parse(scene)
    if tamper == "extra_exclusion":
        ET.SubElement(tree.getroot().find("contact"), "exclude", body1="world", body2="arm")
    elif tamper == "disabled_ground":
        tree.find(".//geom[@name='ground']").set("contype", "0")
        tree.find(".//geom[@name='ground']").set("conaffinity", "0")
    elif tamper == "disabled_contacts":
        ET.SubElement(tree.find("option"), "flag", contact="disable")
    else:
        tree.find(".//geom[@name='collision_arm']").set("pos", "1 0 0")
    tree.write(scene)
    assert not validate(scene, check_portability=False)["passed"]


def test_convex_rejects_shared_transform_preserving_bounds(prepared, tmp_path):
    from photo2sim.assemblies.export import export_assembly

    a, src = prepared
    mesh = trimesh.Trimesh(
        vertices=[
            [0, -0.0125, -0.0125],
            [0.2, -0.0125, -0.0125],
            [0, 0.0125, -0.0125],
            [0, -0.0125, 0.0125],
        ],
        faces=[[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]],
    )
    mesh.export(src / "meshes/arm.obj")
    scene = export_assembly(
        a,
        src,
        tmp_path / "shared-transform",
        collision_mode="convex_mesh",
        exclude_joint_pairs=True,
    )
    tree = ET.parse(scene)
    # Rotation about the AABB centre preserves bounds but changes this hull.
    for name in ("visual_arm", "collision_arm"):
        geom = tree.find(f".//geom[@name='{name}']")
        geom.set("quat", "0 0 0 1")
        geom.set("pos", ".2 0 0")
    tree.write(scene)
    report = validate(scene, check_portability=False)
    assert not report["passed"]
