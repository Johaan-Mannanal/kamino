import json
import shutil
from pathlib import Path
from zipfile import ZipFile

import mujoco
import numpy as np
import pytest

from photo2sim.simulation.so101 import JOINT_NAMES, joint_mapping
from photo2sim.simulation.workspace import (
    WorkspaceLayout,
    build_workspace,
    reset_workspace,
    validate_workspace,
)

ROOT = Path(__file__).resolve().parents[1]
ROBOT = ROOT / "third_party/robotstudio_so101"
ACCEPTED = ROOT / "examples/simulation/apple-20w-charger-cleaned/api-acceptance/simulation.zip"


@pytest.fixture(scope="module")
def prepared(tmp_path_factory):
    folder = tmp_path_factory.mktemp("accepted-charger")
    with ZipFile(ACCEPTED) as archive:
        archive.extractall(folder)
    return folder


@pytest.fixture(scope="module")
def scene(prepared, tmp_path_factory):
    folder = tmp_path_factory.mktemp("workspace") / "bundle"
    return build_workspace(ROBOT, prepared, folder, WorkspaceLayout())


def test_composition_preserves_object_properties_and_uses_named_robot_mapping(scene):
    model = mujoco.MjModel.from_xml_path(str(scene))
    data = mujoco.MjData(model)
    reset_workspace(model, data)
    assert (model.nq, model.nv, model.nu) == (13, 12, 6)
    assert len(joint_mapping(model)) == 6
    assert model.body("asset").mass[0] == pytest.approx(0.059)
    np.testing.assert_allclose(model.geom("collision").size, [0.0215, 0.0135, 0.029])
    np.testing.assert_allclose(model.geom("collision").friction, [0.8, 0.005, 0.0001])
    np.testing.assert_allclose(model.geom("collision").solref, [0.002, 1])
    np.testing.assert_allclose(data.body("asset").xpos, [0.3, 0.1, 0.049])
    assert model.opt.timestep == 0.0001
    source = json.loads((scene.parent / "object/asset.json").read_text())
    assert source["orientation"] == {"x_deg": 90, "y_deg": 0, "z_deg": 0}
    assert source["properties"]["dimensions_m"]["source"] == "estimated"
    assert source["properties"]["sliding_friction"] is None
    assert (scene.parent / "robot/LICENSE").is_file()


def test_reset_restores_full_state_and_nonzero_joint_controls(prepared, tmp_path):
    pose = dict.fromkeys(JOINT_NAMES, 0.0)
    pose.update(shoulder_pan=0.1, gripper=0.3)
    path = build_workspace(ROBOT, prepared, tmp_path / "pose", WorkspaceLayout(robot_qpos_rad=pose))
    model = mujoco.MjModel.from_xml_path(str(path))
    data = mujoco.MjData(model)
    reset_workspace(model, data)
    initial = data.qpos.copy()
    assert initial[model.joint("shoulder_pan").qposadr[0]] == 0.1
    assert data.ctrl[model.actuator("gripper").id] == 0.3
    data.time = 17
    data.qpos[:] = 0.1
    data.qvel[:] = 0.2
    data.ctrl[:] = 0.4
    data.qfrc_applied[:] = 1
    data.xfrc_applied[:] = 1
    reset_workspace(model, data)
    np.testing.assert_array_equal(data.qpos, initial)
    np.testing.assert_array_equal(data.qvel, np.zeros(12))
    np.testing.assert_array_equal(data.qfrc_applied, np.zeros(12))
    assert not data.xfrc_applied.any()
    assert data.time == 0
    assert data.ctrl[model.actuator("gripper").id] == 0.3


@pytest.mark.parametrize(
    "settings",
    [
        {"object_xy_m": [float("nan"), 0]},
        {"table_size_xy_m": [-1, 1]},
        {"robot_qpos_rad": {"gripper": 0}},
        {"robot_qpos_rad": dict.fromkeys(JOINT_NAMES, float("inf"))},
    ],
)
def test_invalid_layout_rejected(settings):
    with pytest.raises(ValueError):
        WorkspaceLayout(**settings)


@pytest.mark.parametrize(
    "settings", [{"object_xy_m": [5, 0]}, {"robot_qpos_rad": dict.fromkeys(JOINT_NAMES, 4.0)}]
)
def test_off_table_or_out_of_range_pose_never_published(prepared, tmp_path, settings):
    output = tmp_path / "invalid"
    with pytest.raises(ValueError):
        build_workspace(ROBOT, prepared, output, WorkspaceLayout(**settings))
    assert not output.exists()


def test_existing_output_preserved(prepared, tmp_path):
    output = tmp_path / "existing"
    output.mkdir()
    (output / "keep.txt").write_text("keep")
    with pytest.raises(FileExistsError):
        build_workspace(ROBOT, prepared, output, WorkspaceLayout())
    assert (output / "keep.txt").read_text() == "keep"


def test_combined_scene_settles_and_resets_reproducibly_after_relocation(scene, tmp_path):
    copied = tmp_path / "relocated"
    shutil.copytree(scene.parent, copied)
    report = validate_workspace(copied / "scene.xml", duration_s=1.0)
    assert report["passed"], report
    assert report["reset_reproducible"]
    assert report["portability_checked"] is False
    assert report["hardware_mapping_verified"] is False
    assert report["manipulation_tested"] is False
    assert report["runs"][0]["table_contact"]
    assert report["runs"][0]["object_robot_contact_count"] == 0
    assert report["runs"][0]["maximum_penetration_m"] <= 0.001


def test_validator_does_not_accept_a_disabled_collision(scene, tmp_path):
    copied = tmp_path / "no-collision"
    shutil.copytree(scene.parent, copied)
    import xml.etree.ElementTree as ET

    xml = ET.parse(copied / "scene.xml")
    geom = xml.find(".//geom[@name='collision']")
    geom.set("contype", "0")
    geom.set("conaffinity", "0")
    xml.write(copied / "scene.xml")
    report = validate_workspace(copied / "scene.xml", duration_s=1.0)
    assert not report["passed"]


@pytest.mark.parametrize("attribute,value", [("mass", "0.1"), ("timestep", "0.0002")])
def test_validator_rejects_scene_that_disagrees_with_recorded_settings(
    scene, tmp_path, attribute, value
):
    import xml.etree.ElementTree as ET

    copied = tmp_path / attribute
    shutil.copytree(scene.parent, copied)
    xml = ET.parse(copied / "scene.xml")
    node = (
        xml.find(".//body[@name='asset']/inertial") if attribute == "mass" else xml.find("option")
    )
    node.set(attribute, value)
    xml.write(copied / "scene.xml")
    report = validate_workspace(copied / "scene.xml", duration_s=1.0)
    assert not report["passed"]
    assert not report["configuration_matches"]
