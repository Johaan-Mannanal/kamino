"""Verify generated SO101 FK against its explicit template, not physical evidence."""

import argparse
import json
from pathlib import Path

import mujoco
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("scene", type=Path)
parser.add_argument("--report", type=Path, required=True)
parser.add_argument("--root-z-offset", type=float, default=0.05)
args = parser.parse_args()
if not np.isfinite(args.root_z_offset):
    parser.error("--root-z-offset must be finite")
root = Path(__file__).resolve().parents[2]
reference = mujoco.MjModel.from_xml_path(str(root / "third_party/robotstudio_so101/so101.xml"))
model = mujoco.MjModel.from_xml_path(str(args.scene))
rdata = mujoco.MjData(reference)
data = mujoco.MjData(model)
joints = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]
bodies = ["base", "shoulder", "upper_arm", "lower_arm", "wrist", "gripper", "moving_jaw_so101_v1"]
poses = [[0] * 6, [0.3, -0.4, 0.5, -0.2, 0.6, 0.4], [-0.5, 0.3, -0.4, 0.2, -0.7, 0.8]]
worst_position = worst_rotation = worst_axis = 0.0
for pose in poses:
    for name, value in zip(joints, pose, strict=True):
        data.qpos[model.joint(name).qposadr[0]] = value
        rdata.qpos[reference.joint(name).qposadr[0]] = value
    mujoco.mj_forward(model, data)
    mujoco.mj_forward(reference, rdata)
    for name in bodies:
        a, b = model.body(name).id, reference.body(name).id
        worst_position = max(
            worst_position,
            float(np.max(np.abs(data.xpos[a] - rdata.xpos[b] - [0, 0, args.root_z_offset]))),
        )
        worst_rotation = max(worst_rotation, float(np.max(np.abs(data.xmat[a] - rdata.xmat[b]))))
    for name in joints:
        a, b = model.joint(name).id, reference.joint(name).id
        worst_axis = max(worst_axis, float(np.max(np.abs(data.xaxis[a] - rdata.xaxis[b]))))
result = {
    "scope": "Template conversion consistency only; same source frames; not independent physical validation",
    "poses_rad": poses,
    "root_translation_difference_m": [0, 0, args.root_z_offset],
    "max_position_error_m": worst_position,
    "max_rotation_element_error": worst_rotation,
    "max_axis_element_error": worst_axis,
    "mujoco_version": mujoco.__version__,
    "passed": max(worst_position, worst_rotation, worst_axis) < 1e-10,
}
args.report.parent.mkdir(parents=True, exist_ok=True)
with args.report.open("x") as f:
    json.dump(result, f, indent=2)
print(json.dumps(result, indent=2))
raise SystemExit(0 if result["passed"] else 1)
