"""SI assembly extensions exercise compiled MuJoCo dynamics, not hardware calibration."""

from xml.etree import ElementTree as ET

import mujoco
import pytest
import trimesh
from pydantic import ValidationError
from test_assemblies import assembly_input

from photo2sim.assemblies.contracts import AssemblyRecord
from photo2sim.assemblies.export import export_assembly
from photo2sim.assemblies.validate import validate_assembly


def source(tmp_path):
    src = tmp_path / "source"
    (src / "meshes").mkdir(parents=True)
    for name in ("base", "arm", "follower"):
        trimesh.creation.box(extents=[0.04, 0.03, 0.02]).export(src / f"meshes/{name}.obj")
    return src


def slider():
    record = assembly_input()
    j = record["joints"][0]
    j.update(
        kind="prismatic",
        limits_rad=None,
        limits_m=[-0.05, 0.05],
        axis=[1, 0, 0],
        drive={"kp": 100, "force_limit_n": 5, "source": "estimated"},
        damping={"value": 6, "source": "estimated"},
    )
    return record


def coupled(kind="revolute"):
    r = slider() if kind == "prismatic" else assembly_input()
    link = dict(r["links"][1], name="follower", visual_mesh="meshes/follower.obj")
    r["links"].append(link)
    j = dict(
        r["joints"][0],
        name="follower_joint",
        child="follower",
        drive=None,
        origin={"position_m": [0, 0.2, 0.06]},
        coupling={
            "driver_joint": r["joints"][0]["name"],
            "ratio": -0.5,
            "offset": 0.01,
            "source": "estimated",
        },
    )
    r["joints"].append(j)
    return r


def test_slider_export_motion_units_and_spring_force(tmp_path):
    src = source(tmp_path)
    r = slider()
    r["joints"][0]["spring"] = {"stiffness": 7, "rest": 0.02, "source": "estimated"}
    scene = export_assembly(AssemblyRecord.model_validate(r), src, tmp_path / "slide")
    m = mujoco.MjModel.from_xml_path(str(scene))
    d = mujoco.MjData(m)
    assert m.jnt_type[0] == mujoco.mjtJoint.mjJNT_SLIDE
    assert m.actuator_forcerange[0] == pytest.approx([-5, 5])
    d.qpos[0] = -0.01
    mujoco.mj_forward(m, d)
    assert d.qfrc_passive[0] == pytest.approx(7 * (0.02 + 0.01))
    before = d.xpos[m.body("arm").id].copy()
    d.qpos[0] += 0.03
    mujoco.mj_forward(m, d)
    assert d.xpos[m.body("arm").id] - before == pytest.approx([0.03, 0, 0])
    assert (
        AssemblyRecord.model_validate_json((scene.parent / "assembly.json").read_text())
        .joints[0]
        .spring.rest
        == 0.02
    )
    report = validate_assembly(scene, check_portability=False)
    assert report["passed"], report
    assert report["original"]["joint_units"] == {"hinge": "m"}
    assert report["original"]["max_tracking_error_m"] < 0.003


def test_hinge_spring_torque_changes_with_rest(tmp_path):
    src = source(tmp_path)
    r = assembly_input()
    r["joints"][0]["spring"] = {"stiffness": 2.5, "rest": 0.3, "source": "user_supplied"}
    scene = export_assembly(AssemblyRecord.model_validate(r), src, tmp_path / "spring")
    m = mujoco.MjModel.from_xml_path(str(scene))
    d = mujoco.MjData(m)
    d.qpos[0] = -0.1
    mujoco.mj_forward(m, d)
    assert d.qfrc_passive[0] == pytest.approx(1)
    m.opt.gravity[:] = 0
    m.opt.disableflags |= mujoco.mjtDisableBit.mjDSBL_ACTUATION
    for _ in range(300):
        mujoco.mj_step(m, d)
    assert d.qpos[0] > -0.1


@pytest.mark.parametrize("kind", ["revolute", "prismatic"])
def test_coupling_correct_direction_no_competing_actuator_and_dynamics(tmp_path, kind):
    src = source(tmp_path)
    scene = export_assembly(AssemblyRecord.model_validate(coupled(kind)), src, tmp_path / kind)
    m = mujoco.MjModel.from_xml_path(str(scene))
    assert (m.nq, m.nu, m.neq) == (2, 1, 1)
    eq = ET.parse(scene).find("./equality/joint")
    assert eq.get("joint1") == "follower_joint" and eq.get("joint2") == "hinge"
    assert [float(x) for x in eq.get("polycoef").split()] == [0.01, -0.5, 0, 0, 0]
    d = mujoco.MjData(m)
    d.ctrl[0] = 0.03 if kind == "prismatic" else 0.4
    for _ in range(2000):
        mujoco.mj_step(m, d)
    q = d.qpos
    assert q[1] == pytest.approx(0.01 - 0.5 * q[0], abs=0.002)
    assert q[0] > 0.02
    assert validate_assembly(scene, check_portability=False)["passed"]


@pytest.mark.parametrize(
    "change", ["missing", "cycle", "fixed", "type", "range", "drive", "units", "nan"]
)
def test_reject_bad_dependency_and_wrong_units(change):
    r = coupled()
    follower = r["joints"][1]
    if change == "missing":
        follower["coupling"]["driver_joint"] = "missing"
    if change == "cycle":
        r["joints"][0].update(
            drive=None,
            coupling={"driver_joint": "follower_joint", "ratio": 1, "source": "estimated"},
        )
    if change == "fixed":
        r["joints"][0] = {
            "name": "hinge",
            "parent": "base",
            "child": "arm",
            "kind": "fixed",
            "source": "estimated",
        }
    if change == "type":
        follower.update(kind="prismatic", limits_rad=None, limits_m=[-2, 2])
    if change == "range":
        follower["coupling"]["ratio"] = 10
    if change == "drive":
        follower["drive"] = r["joints"][0]["drive"]
    if change == "units":
        r = slider()
        r["joints"][0]["drive"] = {"kp": 5, "force_limit_nm": 2, "source": "estimated"}
    if change == "nan":
        follower["coupling"]["offset"] = float("nan")
    with pytest.raises(ValidationError):
        AssemblyRecord.model_validate(r)


def test_link_physics_compiled_and_inspected(tmp_path):
    src = source(tmp_path)
    r = assembly_input()
    r["links"][1]["physics"] = {
        "collision": {"kind": "box", "box_size_m": [0.05, 0.04, 0.03], "offset_m": [0.01, 0, 0]},
        "rolling_friction": {"value": 0.03, "source": "estimated"},
        "inertia": {
            "mode": "manual",
            "center_of_mass_m": [0, 0.01, 0],
            "diagonal_kg_m2": [0.001, 0.001, 0.001],
            "source": "user_supplied",
        },
        "contact": {"compliance": "soft", "response": "high", "source": "estimated"},
    }
    scene = export_assembly(AssemblyRecord.model_validate(r), src, tmp_path / "physics")
    m = mujoco.MjModel.from_xml_path(str(scene))
    assert m.body("arm").ipos == pytest.approx([0, 0.01, 0])
    assert m.geom("collision_arm").size == pytest.approx([0.025, 0.02, 0.015])
    assert m.geom("collision_arm").pos == pytest.approx([0.01, 0, 0])
    assert m.geom("collision_arm").condim[0] == 6
    assert m.geom("collision_arm").solref == pytest.approx([0.02, 0.4])
    # No tracking acceptance needed for this deliberately low-gain/heavy-inertia experiment.
    report = validate_assembly(scene, check_portability=False)
    assert report["original"]["checks"]["reviewed_model_consistency"], report
    tree = ET.parse(scene)
    tree.find(".//joint").set("stiffness", "2")
    tree.write(scene)
    assert not validate_assembly(scene, check_portability=False)["passed"]


def test_job_saved_revision_reopens_advanced_physics_and_preserves_old_attempt(tmp_path):
    from fastapi.testclient import TestClient
    from test_assembly_jobs_api import finished, project, upload

    from photo2sim.api.app import create_app
    from photo2sim.api.config import Settings
    from photo2sim.assemblies.review import ReviewProject, review_snapshot

    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        job = upload(client).json()
        base = f"/api/assembly-jobs/{job['id']}"
        assert client.post(base + "/process", json={"expected_revision": 1}).status_code == 202
        first = finished(client, job["id"])
        assert first["status"] == "completed"
        old_export = client.get(base + "/files/" + first["export_path"]).content
        edited = project()
        edited["groups"][1]["physics"] = {
            "torsional_friction": {
                "value": 0.01,
                "source": "user_supplied",
                "note": "Synthetic setting",
            }
        }
        edited["joints"][0]["spring"] = {
            "stiffness": 0.2,
            "rest": 0.1,
            "source": "estimated",
            "note": "Synthetic spring",
        }
        parsed = ReviewProject.model_validate(edited)
        parsed.review_snapshot = review_snapshot(parsed)
        saved = client.put(
            base + "/revisions",
            json={"expected_revision": 1, "project": parsed.model_dump(mode="json")},
        )
        assert saved.status_code == 201, saved.text
        reopened = client.get(base).json()
        package = client.get(base + "/files/" + reopened["package_path"]).json()
        assert package["project"]["groups"][1]["physics"]["torsional_friction"]["value"] == 0.01
        assert package["project"]["joints"][0]["spring"]["rest"] == 0.1
        assert client.get(base + "/files/" + first["export_path"]).content == old_export
        assert reopened["attempts"][0]["revision"] == 1


def test_recorded_replay_derives_linked_hinge_and_slider_zero_pose(tmp_path):
    import json

    from test_observation_replay import fixture

    from photo2sim.assemblies.observation_replay import apply_frame, replay_frames

    _model, review, project = fixture()
    project["joints"].extend(
        [
            {
                "name": "follower",
                "kind": "revolute",
                "limits_rad": [-2, 2],
                "coupling": {"driver_joint": "hinge", "ratio": -0.5, "offset": 0.2},
            },
            {"name": "slide", "kind": "prismatic", "limits_m": [-0.1, 0.1]},
            {
                "name": "slide_follower",
                "kind": "prismatic",
                "limits_m": [-0.1, 0.1],
                "coupling": {"driver_joint": "slide", "ratio": 2, "offset": 0.01},
            },
        ]
    )
    review["project_snapshot"] = json.dumps(project)
    m = mujoco.MjModel.from_xml_string("""<mujoco><compiler angle="radian"/><worldbody>
      <body><joint name="hinge" range="-1 1"/><geom type="sphere" size=".01" mass=".1"/></body>
      <body><joint name="follower" range="-2 2"/><geom type="sphere" size=".01" mass=".1"/></body>
      <body><joint name="slide" type="slide" range="-.1 .1"/><geom type="sphere" size=".01" mass=".1"/></body>
      <body><joint name="slide_follower" type="slide" range="-.1 .1"/><geom type="sphere" size=".01" mass=".1"/></body>
    </worldbody></mujoco>""")
    frame = replay_frames(m, review, project, "synthetic-motion")["frames"][1]
    assert frame["angles_rad"]["follower"] == pytest.approx(
        0.2 - 0.5 * frame["angles_rad"]["hinge"]
    )
    assert frame["positions_m"] == {"slide": 0, "slide_follower": 0.01}
    d = mujoco.MjData(m)
    apply_frame(m, d, frame)
    assert d.qpos[1] == pytest.approx(frame["angles_rad"]["follower"])
    assert d.qpos[3] == pytest.approx(0.01)
    assert all(d.qvel == 0)


def test_mapping_requires_only_independent_hinge_drivers():
    import copy

    from test_assembly_jobs_api import project
    from test_mapping_retention import mapping_review

    from photo2sim.assemblies.mapping_review import validate_mapping_review
    from photo2sim.assemblies.review import ReviewProject

    p = project()
    p["groups"].append(dict(p["groups"][1], name="jaw"))
    p["joints"].append(
        dict(
            p["joints"][0],
            name="jaw_joint",
            child="jaw",
            drive=None,
            coupling={"driver_joint": "hinge", "ratio": -0.5, "offset": 0, "source": "estimated"},
        )
    )
    parsed = ReviewProject.model_validate(p)
    review = mapping_review(parsed.model_dump(mode="json"))
    assert len(review["mappings"]) == 1
    validate_mapping_review(review, parsed)
    wrong = copy.deepcopy(review)
    wrong["mappings"].append(dict(wrong["mappings"][0], joint="jaw_joint"))
    with pytest.raises(ValueError, match="Mapping"):
        validate_mapping_review(wrong, parsed)


def test_legacy_default_omissions_preserve_mapping_snapshot_and_attestation():
    import copy
    import json

    from test_assembly_jobs_api import project
    from test_mapping_retention import mapping_review

    from photo2sim.assemblies.mapping_review import (
        _binding,
        canonical_json,
        validate_mapping_review,
    )
    from photo2sim.assemblies.review import ReviewProject, normalize_project_defaults

    legacy = normalize_project_defaults(project())
    legacy["review_snapshot"] = canonical_json(
        normalize_project_defaults(json.loads(legacy["review_snapshot"]))
    )
    review = mapping_review(legacy)
    mapping = review["mappings"][0]
    mapping.update(
        status="user_verified",
        reviewer="Synthetic reviewer",
        evidence_note="Two synthetic readings",
        capture_ids=["pose-a", "pose-b"],
    )
    mapping["verification_binding"] = canonical_json(
        _binding(legacy, review["captures"]["captures"], mapping)
    )
    retained = copy.deepcopy(review)
    expanded = ReviewProject.model_validate(legacy)
    assert "physics" in expanded.model_dump()["groups"][0]
    validate_mapping_review(review, expanded)
    assert review == retained  # Old evidence is not rewritten while validating.
    changed = expanded.model_dump(mode="json")
    changed["groups"][0]["physics"] = {"rolling_friction": {"value": 0.01, "source": "estimated"}}
    with pytest.raises(ValueError, match="different project revision"):
        validate_mapping_review(review, ReviewProject.model_validate(changed))
    forged = copy.deepcopy(review)
    forged["mappings"][0]["evidence_note"] = "Changed attestation"
    with pytest.raises(ValueError, match="Stale verification"):
        validate_mapping_review(forged, expanded)


def test_legacy_review_mapping_reopens_and_reprocesses_without_rewriting_evidence(tmp_path):
    import json

    from fastapi.testclient import TestClient
    from test_assembly_jobs_api import finished, project, upload
    from test_mapping_retention import mapping_review

    from photo2sim.api.app import create_app
    from photo2sim.api.config import Settings
    from photo2sim.assemblies.mapping_review import canonical_json
    from photo2sim.assemblies.review import normalize_project_defaults

    legacy = normalize_project_defaults(project())
    legacy["review_snapshot"] = canonical_json(
        normalize_project_defaults(json.loads(legacy["review_snapshot"]))
    )
    review = mapping_review(legacy)
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        result = upload(client, legacy)
        assert result.status_code == 202, result.text
        job = result.json()
        base = f"/api/assembly-jobs/{job['id']}"
        saved = client.put(
            base + "/mapping-review",
            json={"expected_revision": 1, "expected_mapping_version": 0, "review": review},
        )
        assert saved.status_code == 200, saved.text
        retained = client.get(base + "/files/" + saved.json()["mapping_review_path"]).json()
        assert retained == review
        assert (
            client.post(
                base + "/process", json={"expected_revision": 1, "expected_mapping_version": 1}
            ).status_code
            == 202
        )
        completed = finished(client, job["id"])
        assert completed["status"] == "completed", completed.get("error")
        assert (
            client.post(
                base + "/process", json={"expected_revision": 1, "expected_mapping_version": 0}
            ).status_code
            == 409
        )


def test_scripted_motion_records_followers_and_rejects_unsettled_coupling(tmp_path):
    import json

    from photo2sim.assemblies.motion import run_motion

    r = coupled()
    r["joints"][1]["coupling"].update(ratio=0, offset=0.2)
    scene = export_assembly(
        AssemblyRecord.model_validate(r), source(tmp_path), tmp_path / "coupled-motion"
    )
    quick = run_motion(
        scene, [{"duration_s": 0.01, "targets_rad": {"hinge": 0}}], tmp_path / "quick"
    )
    assert not quick["passed"]
    phase = quick["phases"][0]
    assert phase["expected_rad"]["follower_joint"] == 0.2
    assert phase["coupling_residuals_rad"]["follower_joint"] > 0.03
    assert phase["final_max_error_rad"] > 0.03
    trace = json.loads((tmp_path / "quick/trace.json").read_text())
    assert "follower_joint" in trace[-1]["observed_rad"]
    assert trace[-1]["expected_rad"]["follower_joint"] == 0.2
    assert trace[-1]["targets_rad"] == {"hinge": 0}
    settled = run_motion(
        scene, [{"duration_s": 2, "targets_rad": {"hinge": 0}}], tmp_path / "settled"
    )
    assert settled["passed"], settled
    assert settled["phases"][0]["coupling_residuals_rad"]["follower_joint"] < 0.03
