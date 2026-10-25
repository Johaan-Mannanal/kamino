"""Run named joint targets in an exported simulation; record actual motion and optional GIF."""

import argparse
import hashlib
import json
import math
import warnings
from pathlib import Path

import mujoco
import numpy as np
from PIL import Image, ImageDraw

from photo2sim.assemblies.contracts import AssemblyRecord
from photo2sim.assemblies.validate import TRACKING_TOLERANCE_RAD, validate_assembly


def save(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def run_motion(scene: Path, phases: list[dict], output_dir: Path, *, render=False, fps=20):
    """Reset simulation, apply bounded piecewise-constant targets, retain run evidence."""
    output_dir = Path(output_dir).absolute()
    if output_dir.exists() or output_dir.is_symlink():
        raise FileExistsError(output_dir)
    scene, output_dir = Path(scene).resolve(), output_dir.resolve()
    record = AssemblyRecord.model_validate_json((scene.parent / "assembly.json").read_text())
    joints = {j.name: j for j in record.joints if j.kind == "revolute"}
    if not joints or not isinstance(phases, list) or not 1 <= len(phases) <= 100:
        raise ValueError("Need 1–100 phases and at least one revolute joint")
    if type(fps) is not int or not 1 <= fps <= 30:
        raise ValueError("FPS must be an integer in 1–30")
    total = 0
    for phase in phases:
        duration = phase.get("duration_s")
        if type(duration) not in (int, float) or not math.isfinite(duration) or duration <= 0:
            raise ValueError("Phase duration must be positive and finite")
        total += duration
        targets = phase.get("targets_rad", {})
        if set(targets) != set(joints):
            raise ValueError("Every phase must name every driven joint exactly once")
        for name, value in targets.items():
            if type(value) not in (int, float) or not math.isfinite(value):
                raise ValueError("Targets must be finite radians")
            if not joints[name].limits_rad[0] <= value <= joints[name].limits_rad[1]:
                raise ValueError("Target outside reviewed limits; no clipping performed")
    if total > 60:
        raise ValueError("Maximum requested sequence duration is 60 seconds")
    # Use existing complete model/contact/motion preflight; it opens no hardware.
    preflight = validate_assembly(scene, check_portability=False)
    if not preflight["passed"]:
        raise ValueError("Export must pass motion validation before demo recording")
    model = mujoco.MjModel.from_xml_path(str(scene))
    data = mujoco.MjData(model)
    addresses = {
        n: (int(model.joint(n).qposadr[0]), model.actuator("drive_" + n).id) for n in joints
    }
    assumptions = json.loads((scene.parent / "simulation.json").read_text())
    output_dir.mkdir(parents=True, exist_ok=False)
    save(output_dir / "actions.json", phases)
    save(output_dir / "preflight.json", preflight)
    report = {
        "scope": "Scripted simulation replay; not hardware observation or physical accuracy",
        "passed": False,
        "physical_accuracy_verified": False,
        "mujoco_version": mujoco.__version__,
        "synthetic": record.synthetic,
        "scene_sha256": hashlib.sha256(scene.read_bytes()).hexdigest(),
        "source_mesh_hashes": {n: v["source_mesh_sha256"] for n, v in assumptions["links"].items()},
        "root_pose": record.root_pose.model_dump(),
        "assumptions": record.notes,
        "collision_policy": assumptions["collision"],
        "tracking_tolerance_rad": TRACKING_TOLERANCE_RAD,
        "timestep_s": float(model.opt.timestep),
        "phases": [],
        "warning_count": 0,
        "python_warnings": [],
        "max_joint_limit_violation_rad": 0.0,
        "replay": None,
    }
    trace, frames = [], []
    renderer = None
    camera = mujoco.MjvCamera()
    mujoco.mjv_defaultCamera(camera)
    # The ground plane dominates MuJoCo's default extent. Frame the exported
    # visual geometry instead, preserving source scale and simulation placement.
    mujoco.mj_forward(model, data)
    vertices = []
    for link in record.links:
        gid = model.geom("visual_" + link.name).id
        mid = int(model.geom_dataid[gid])
        start, count = int(model.mesh_vertadr[mid]), int(model.mesh_vertnum[mid])
        vertices.append(
            model.mesh_vert[start : start + count] @ data.geom_xmat[gid].reshape(3, 3).T
            + data.geom_xpos[gid]
        )
    vertices = np.concatenate(vertices)
    lo, hi = vertices.min(axis=0), vertices.max(axis=0)
    camera.lookat[:] = (lo + hi) / 2
    camera.distance = max(float(np.linalg.norm(hi - lo)) * 2, 0.1)
    camera.azimuth, camera.elevation = 120, -25
    options = mujoco.MjvOption()
    options.geomgroup[3] = 0
    stride = max(1, round(1 / (fps * model.opt.timestep)))

    def sample(phase_index):
        mujoco.mj_forward(model, data)
        row = {
            "time_s": float(data.time),
            "phase": phase_index,
            "targets_rad": {n: float(data.ctrl[a]) for n, (_, a) in addresses.items()},
            "observed_rad": {n: float(data.qpos[q]) for n, (q, _) in addresses.items()},
        }
        trace.append(row)
        if renderer is not None:
            renderer.update_scene(data, camera=camera, scene_option=options)
            frame = Image.fromarray(renderer.render())
            draw = ImageDraw.Draw(frame)
            draw.rectangle((0, 0, 640, 48), fill="#15191c")
            draw.text(
                (10, 6),
                "Kamino | simulated actuator motion | physical accuracy unverified",
                fill="white",
            )
            draw.text(
                (10, 25),
                f"t={data.time:.2f}s | phase {phase_index + 1} | assumed dynamics / mounting",
                fill="white",
            )
            frames.append(frame)
        return row

    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            if render:
                renderer = mujoco.Renderer(model, height=480, width=640)
            mujoco.mj_resetData(model, data)
            for index, phase in enumerate(phases):
                for name, (_, aid) in addresses.items():
                    data.ctrl[aid] = phase["targets_rad"][name]
                sample(index)
                steps = max(1, math.ceil(phase["duration_s"] / model.opt.timestep))
                for step in range(steps):
                    mujoco.mj_step(model, data)
                    if not all(np.isfinite(v).all() for v in (data.qpos, data.qvel, data.qacc)):
                        raise ValueError("Nonfinite simulated state")
                    for n, (q, _) in addresses.items():
                        lo, hi = joints[n].limits_rad
                        report["max_joint_limit_violation_rad"] = max(
                            report["max_joint_limit_violation_rad"],
                            lo - float(data.qpos[q]),
                            float(data.qpos[q]) - hi,
                        )
                    if (step + 1) % stride == 0 or step + 1 == steps:
                        sample(index)
                actual = {n: float(data.qpos[q]) for n, (q, _) in addresses.items()}
                error = max(abs(actual[n] - phase["targets_rad"][n]) for n in joints)
                report["phases"].append(
                    {
                        **phase,
                        "observed_rad": actual,
                        "final_max_error_rad": error,
                        "end_time_s": float(data.time),
                    }
                )
            report["warning_count"] = sum(int(w.number) for w in data.warning)
            report["python_warnings"] = [str(w.message) for w in caught]
        report["passed"] = (
            not report["warning_count"]
            and not report["python_warnings"]
            and report["max_joint_limit_violation_rad"] <= TRACKING_TOLERANCE_RAD
            and all(p["final_max_error_rad"] <= TRACKING_TOLERANCE_RAD for p in report["phases"])
        )
        if frames:
            # GIF timing is quantized to 10 ms; this is a labeled approximate replay.
            duration = [
                max(10, round((b["time_s"] - a["time_s"]) * 100) * 10)
                for a, b in zip(trace, trace[1:])
            ] + [100]
            frames[0].save(
                output_dir / "replay.gif",
                save_all=True,
                append_images=frames[1:],
                duration=duration,
                loop=0,
            )
            report["replay"] = "replay.gif"
            report["replay_timing"] = (
                "Approximate GIF timing (10 ms resolution), with reset on loop"
            )
        return report
    except Exception as error:
        report["passed"] = False
        report["error"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        if renderer is not None:
            renderer.close()
        save(output_dir / "trace.json", trace)
        save(output_dir / "report.json", report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scene", type=Path)
    parser.add_argument("actions", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args()
    report = run_motion(
        args.scene, json.loads(args.actions.read_text()), args.output_dir, render=args.render
    )
    print(json.dumps({"passed": report["passed"], "output_dir": str(args.output_dir)}))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
