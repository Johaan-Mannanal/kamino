"""Offline SO101 model inspection. No robot connections or hardware commands."""

import argparse
import json
import math
import warnings
from pathlib import Path

import mujoco
import numpy as np

JOINT_NAMES = (
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
    "gripper",
)


def joint_mapping(model: mujoco.MjModel) -> list[dict]:
    """Resolve simulation addresses by name; this is not a hardware calibration."""
    rows = []
    for name in JOINT_NAMES:
        jid = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, name)
        aid = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_ACTUATOR, name)
        if jid < 0 or aid < 0:
            raise ValueError(f"Missing joint or actuator: {name}")
        if model.jnt_type[jid] != mujoco.mjtJoint.mjJNT_HINGE:
            raise ValueError(f"Expected hinge joint: {name}")
        if (
            model.actuator_trntype[aid] != mujoco.mjtTrn.mjTRN_JOINT
            or model.actuator_trnid[aid, 0] != jid
        ):
            raise ValueError(f"Actuator does not directly target its named joint: {name}")
        rows.append(
            {
                "joint_name": name,
                "observation_key": f"{name}.pos",
                "joint_id": int(jid),
                "qpos_address": int(model.jnt_qposadr[jid]),
                "dof_address": int(model.jnt_dofadr[jid]),
                "actuator_id": int(aid),
                "joint_range_rad": model.jnt_range[jid].tolist(),
                "control_range_rad": model.actuator_ctrlrange[aid].tolist(),
                "joint_limited": bool(model.jnt_limited[jid]),
                "control_limited": bool(model.actuator_ctrllimited[aid]),
                "hardware_mapping_status": "pending_windows_calibration_and_pose_check",
            }
        )
    return rows


def inspect_model(scene: Path, *, duration_s: float = 2.0) -> dict:
    """Load the standalone robot and run a numerical zero-target hold smoke test."""
    if not math.isfinite(duration_s) or duration_s <= 0:
        raise ValueError("duration_s must be finite and positive")
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        model = mujoco.MjModel.from_xml_path(str(scene))
        rows = joint_mapping(model)
        if (model.nq, model.nv, model.nu) != (6, 6, 6):
            raise ValueError("Inspection expects the standalone six-joint robot scene")
        data = mujoco.MjData(model)
        mujoco.mj_forward(model, data)
        initial_qpos = data.qpos.copy()
        for row in rows:
            data.ctrl[row["actuator_id"]] = data.qpos[row["qpos_address"]]
        sid = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, "gripperframe")
        if sid < 0:
            raise ValueError("Missing gripperframe site")
        initial_site = data.site_xpos[sid].tolist()
        steps = math.ceil(duration_s / model.opt.timestep)
        finite = True
        max_deviation = 0.0
        for _ in range(steps):
            mujoco.mj_step(model, data)
            finite = finite and bool(
                np.isfinite(data.qpos).all()
                and np.isfinite(data.qvel).all()
                and np.isfinite(data.qacc).all()
            )
            max_deviation = max(max_deviation, float(np.max(np.abs(data.qpos - initial_qpos))))
        mujoco.mj_forward(model, data)
    warning_count = int(sum(w.number for w in data.warning))
    return {
        "mujoco_version": mujoco.__version__,
        "scene": scene.name,
        "nq": model.nq,
        "nv": model.nv,
        "nu": model.nu,
        "joints": rows,
        "timestep_s": float(model.opt.timestep),
        "steps": steps,
        "simulated_duration_s": float(data.time),
        "finite_state": finite,
        "warning_count": warning_count,
        "python_warnings": [str(w.message) for w in caught],
        "max_hold_deviation_rad": max_deviation,
        "initial_qpos_rad": initial_qpos.tolist(),
        "final_qpos_rad": data.qpos.tolist(),
        "initial_gripperframe_position_m": initial_site,
        "final_gripperframe_position_m": data.site_xpos[sid].tolist(),
        "numerical_smoke_passed": finite and warning_count == 0 and not caught,
        "hardware_mapping_verified": False,
        "scope": "Standalone simulation load/finite-state check; no hardware or task validation",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--scene", type=Path, default=Path("third_party/robotstudio_so101/scene.xml")
    )
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = inspect_model(args.scene)
    encoded = json.dumps(report, indent=2, allow_nan=False) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        with args.report.open("x") as stream:
            stream.write(encoded)
    print(encoded)
    if not report["numerical_smoke_passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
