from pathlib import Path

import mujoco
import numpy as np
import pytest

from photo2sim.simulation import so101

SCENE = Path(__file__).resolve().parents[1] / "third_party/robotstudio_so101/scene.xml"
NAMES = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")


def tiny_model(actuator_names=NAMES):
    bodies = "".join(
        f'<body pos="{i} 0 0"><joint name="{name}" type="hinge" range="-1 1"/>'
        '<geom type="sphere" size="0.01" mass="0.1"/></body>'
        for i, name in enumerate(NAMES)
    )
    actuators = "".join(
        f'<position name="{name}" joint="{name}" ctrlrange="-1 1"/>' for name in actuator_names
    )
    return mujoco.MjModel.from_xml_string(
        '<mujoco><compiler angle="radian" autolimits="true"/>'
        f"<worldbody>{bodies}</worldbody><actuator>{actuators}</actuator></mujoco>"
    )


def test_mapping_resolves_actuators_by_name_instead_of_assuming_joint_order():
    rows = so101.joint_mapping(tiny_model(tuple(reversed(NAMES))))
    pan = rows[0]
    assert pan["observation_key"] == "shoulder_pan.pos"
    assert pan["qpos_address"] == 0
    assert pan["actuator_id"] == 5
    assert pan["joint_range_rad"] == [-1, 1]
    assert rows[-1]["actuator_id"] == 0


def test_mapping_rejects_missing_actuator():
    with pytest.raises(ValueError, match="gripper"):
        so101.joint_mapping(tiny_model(NAMES[:-1]))


def test_mapping_rejects_actuator_targeting_wrong_joint():
    model = tiny_model()
    model.actuator_trnid[0, 0] = 1
    with pytest.raises(ValueError, match="shoulder_pan"):
        so101.joint_mapping(model)


def test_pinned_robot_loads_and_holds_without_numerical_warnings():
    report = so101.inspect_model(SCENE, duration_s=2.0)
    assert report["numerical_smoke_passed"]
    assert report["hardware_mapping_verified"] is False
    assert report["nq"] == report["nv"] == report["nu"] == 6
    assert report["steps"] == 400
    assert report["warning_count"] == 0
    assert np.isfinite(report["final_gripperframe_position_m"]).all()
    assert {r["joint_name"] for r in report["joints"]} == set(NAMES)


@pytest.mark.parametrize("duration", [0, -1, float("nan"), float("inf")])
def test_inspection_rejects_invalid_duration(duration):
    with pytest.raises(ValueError, match="duration"):
        so101.inspect_model(SCENE, duration_s=duration)
