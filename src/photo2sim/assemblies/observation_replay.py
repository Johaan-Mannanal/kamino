"""Portable recorded-pose replay. Assigns qpos and calls mj_forward, never mj_step.

Copied into exports; depends only on Python's standard library and MuJoCo.
"""

import argparse
import bisect
import copy
import json
import math
import time
from pathlib import Path

import mujoco


def require(ok, message):
    if not ok:
        raise ValueError(message)


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def normalize_project_defaults(value):
    """Only new omitted/null assembly extension defaults are equivalent.

    Do not omit non-default physics or normalize unrelated fields: these values
    are also used to bind retained mapping attestations to a specific revision.
    """
    data = copy.deepcopy(value)
    if not isinstance(data, dict):
        return data
    for key in ("groups", "links"):
        for item in data.get(key, []) if isinstance(data.get(key), list) else []:
            if isinstance(item, dict) and item.get("physics") is None:
                item.pop("physics", None)
    for joint in data.get("joints", []) if isinstance(data.get("joints"), list) else []:
        if not isinstance(joint, dict):
            continue
        for key in ("limits_m", "spring", "coupling"):
            if joint.get(key) is None:
                joint.pop(key, None)
        drive = joint.get("drive")
        if isinstance(drive, dict):
            for key in ("force_limit_n", "force_limit_nm"):
                if drive.get(key) is None:
                    drive.pop(key, None)
    return data


def replay_frames(model, review, project, capture_id):
    require(review.get("format") == "photo2sim-mapping-review-1.0", "Unsupported mapping review")
    require(
        normalize_project_defaults(json.loads(review["project_snapshot"]))
        == normalize_project_defaults(project),
        "Mapping belongs to another project",
    )
    pack = review["captures"]
    require(pack.get("format") == "photo2sim-captures-1.0", "Unsupported capture pack")
    captures = pack["captures"]
    matches = [c for c in captures if c["id"] == capture_id]
    require(len(matches) == 1, "Select one existing capture ID")
    capture = matches[0]
    rows = capture.get("observations", [])
    require(
        2 <= len(rows) <= 20_000 and len(rows) == capture["samples"],
        "Timestamped observations required",
    )
    moving = {j["name"]: j for j in project["joints"] if j["kind"] != "fixed"}
    joints = {n: j for n, j in moving.items() if j["kind"] == "revolute" and not j.get("coupling")}
    mappings = review["mappings"]
    require(
        len(mappings) == len(joints) and {m["joint"] for m in mappings} == set(joints),
        "Mapping joint mismatch",
    )
    require(model.njnt == len(moving), "Scene joint count differs from project")
    for name, joint in moving.items():
        idx = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, name)
        require(
            idx >= 0
            and model.jnt_type[idx]
            == (
                mujoco.mjtJoint.mjJNT_SLIDE
                if joint["kind"] == "prismatic"
                else mujoco.mjtJoint.mjJNT_HINGE
            ),
            "Scene hinge missing: " + name,
        )
        require(
            bool(model.jnt_limited[idx])
            and all(
                math.isclose(float(a), b, abs_tol=1e-7)
                for a, b in zip(
                    model.jnt_range[idx],
                    joint["limits_m"] if joint["kind"] == "prismatic" else joint["limits_rad"],
                )
            ),
            "Scene limits differ from project: " + name,
        )
    units = {
        "degrees": math.pi / 180,
        "radians": 1,
        "normalized_0_100": None,
        "normalized_-100_100": None,
    }
    for m in mappings:
        require(
            m["unit"] in units
            and type(m["sign"]) is int
            and m["sign"] in (-1, 1)
            and finite(m["offset_rad"]),
            "Invalid conversion",
        )
        scale = m["radians_per_unit"]
        require(scale is None or (finite(scale) and scale > 0), "Invalid conversion scale")
        require(
            units[m["unit"]] is None or scale == units[m["unit"]],
            "Angular unit conversion mismatch",
        )
        require(m["status"] in ("unverified", "user_verified"), "Invalid mapping status")
    previous = -1
    frames = []
    calibration_conflict = len({c["calibration_sha256"] for c in captures}) != 1
    for row in rows:
        t = row["time_s"]
        require(finite(t) and t >= 0 and t > previous, "Observation times must increase")
        previous = t
        values = row["values"]
        require(
            set(values) == set(capture["signals"]) and all(finite(v) for v in values.values()),
            "Invalid observation values",
        )
        for key, value in values.items():
            signal = capture["signals"][key]
            require(
                signal["minimum"] - 1e-9 <= value <= signal["maximum"] + 1e-9,
                "Observation outside recorded extrema",
            )
        angles, issues = {}, []
        if calibration_conflict:
            issues.append("Different calibration hashes across captures")
        for m in mappings:
            name, source = m["joint"], m["signal"]
            angle = None
            if source not in values:
                issues.append(name + ": missing source signal")
            elif capture["signals"][source]["unit"] != m["unit"]:
                issues.append(name + ": source unit mismatch")
            elif m["radians_per_unit"] is None:
                issues.append(name + ": conversion unset; displayed at zero")
            else:
                angle = m["sign"] * m["radians_per_unit"] * values[source] + m["offset_rad"]
                require(finite(angle), "Nonfinite converted angle")
                low, high = joints[name]["limits_rad"]
                if angle < low or angle > high:
                    issues.append(name + ": joint limit conflict; not clipped")
            if sum(other["signal"] == source for other in mappings) > 1:
                issues.append(name + ": duplicate source mapping")
            angles[name] = angle
        resolved, visiting = {}, set()

        def resolve(name):
            if name in resolved:
                return resolved[name]
            require(name not in visiting, "Cycle in linked joint motion")
            visiting.add(name)
            joint = moving[name]
            value = angles.get(name)
            coupling = joint.get("coupling")
            if coupling:
                driver = coupling["driver_joint"]
                require(
                    driver in moving and moving[driver]["kind"] == joint["kind"],
                    "Invalid linked driver",
                )
                driver_value = resolve(driver)
                value = coupling["offset"] + coupling["ratio"] * (
                    0 if driver_value is None else driver_value
                )
            elif joint["kind"] == "prismatic":
                value = 0
            visiting.remove(name)
            resolved[name] = value
            return value

        for name in moving:
            resolve(name)
        frame = {
            "time_s": t,
            "angles_rad": {n: v for n, v in resolved.items() if moving[n]["kind"] == "revolute"},
            "issues": issues,
        }
        if any(j["kind"] == "prismatic" for j in moving.values()):
            frame["positions_m"] = {
                n: v for n, v in resolved.items() if moving[n]["kind"] == "prismatic"
            }
        frames.append(frame)
    return {
        "format": "photo2sim-observation-replay-1.0",
        "capture_id": capture_id,
        "physical_accuracy_verified": False,
        "dynamics_tested": False,
        "mapping_status": {m["joint"]: m["status"] for m in mappings},
        "note": "Recorded kinematic poses only; user verification is an attestation. No predicted dynamics or hardware commands. Unmapped independent joints display at zero; linked followers are derived from their driver. Limits are not clipped.",
        "frames": frames,
    }


def apply_frame(model, data, frame):
    mujoco.mj_resetData(model, data)
    for name, angle in {**frame["angles_rad"], **frame.get("positions_m", {})}.items():
        idx = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, name)
        require(idx >= 0, "Scene joint missing")
        data.qpos[model.jnt_qposadr[idx]] = 0 if angle is None else angle
    data.time = frame["time_s"]
    mujoco.mj_forward(model, data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scene", type=Path, default=Path(__file__).with_name("scene.xml"))
    parser.add_argument("--review", type=Path)
    parser.add_argument("--project", type=Path)
    parser.add_argument("--capture", required=True)
    parser.add_argument("--report", type=Path)
    parser.add_argument(
        "--view", action="store_true", help="Native viewer: Space pauses, R resets; close to exit"
    )
    args = parser.parse_args()
    root = args.scene.parent
    review = json.loads((args.review or root / "mapping-review.json").read_text())
    project = json.loads((args.project or root / "reviewed-project.json").read_text())
    model = mujoco.MjModel.from_xml_path(str(args.scene))
    result = replay_frames(model, review, project, args.capture)
    data = mujoco.MjData(model)
    for frame in result["frames"]:
        apply_frame(model, data, frame)
        require(all(math.isfinite(float(v)) for v in data.qpos), "Nonfinite replay state")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        with args.report.open("x") as stream:
            json.dump(result, stream, indent=2, allow_nan=False)
            stream.write("\n")
    print(
        json.dumps(
            {
                "samples": len(result["frames"]),
                "frames_with_conflicts": sum(bool(f["issues"]) for f in result["frames"]),
                "physical_accuracy_verified": False,
                "dynamics_tested": False,
            }
        )
    )
    if args.view:
        from mujoco import viewer as mj_viewer

        state = {"paused": False, "reset": False}

        def keypress(key):
            if key == 32:
                state["paused"] = not state["paused"]
            elif key in (82, 114):
                state["reset"] = True

        times = [f["time_s"] for f in result["frames"]]
        elapsed, last = times[0], time.monotonic()
        with mj_viewer.launch_passive(model, data, key_callback=keypress) as viewer:
            while viewer.is_running():
                current = time.monotonic()
                if state["reset"]:
                    elapsed = times[0]
                    state["reset"] = False
                elif not state["paused"]:
                    elapsed = min(times[-1], elapsed + current - last)
                last = current
                index = max(0, bisect.bisect_right(times, elapsed) - 1)
                with viewer.lock():
                    apply_frame(model, data, result["frames"][index])
                viewer.sync()
                time.sleep(0.01)


if __name__ == "__main__":
    main()
