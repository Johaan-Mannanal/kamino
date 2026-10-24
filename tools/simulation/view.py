"""Open the native MuJoCo viewer for a synthetic scene; no robot or camera access."""

import argparse
import json
import time
from pathlib import Path

import mujoco
import mujoco.viewer


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--scene",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "examples/simulation/synthetic-box/scene.xml",
    )
    parser.add_argument(
        "--seconds",
        type=float,
        default=0,
        help="Auto-close after this many wall seconds; 0 waits for window close",
    )
    parser.add_argument(
        "--collision", action="store_true", help="Show collision group 3 instead of visual group 2"
    )
    parser.add_argument(
        "--report",
        type=Path,
        help="Optional viewer-loop telemetry; visual verification still requires observation",
    )
    parser.add_argument("--azimuth", type=float, default=135, help="Initial orbit angle in degrees")
    parser.add_argument(
        "--elevation", type=float, default=-25, help="Initial camera elevation in degrees"
    )
    parser.add_argument(
        "--body-axes", action="store_true", help="Show body axes: X red, Y green, Z blue"
    )
    parser.add_argument("--distance", type=float, help="Initial camera distance in metres")
    parser.add_argument(
        "--hide-ground",
        action="store_true",
        help="Hide render group 0 (ground in exported scenes), without disabling contacts",
    )
    args = parser.parse_args()
    model = mujoco.MjModel.from_xml_path(str(args.scene.resolve()))
    data = mujoco.MjData(model)
    started = time.perf_counter()
    steps = syncs = 0
    frame_steps = max(1, round(1 / (60 * model.opt.timestep)))
    with mujoco.viewer.launch_passive(model, data) as viewer:
        with viewer.lock():
            viewer.cam.lookat[:] = model.stat.center
            viewer.cam.distance = (
                args.distance if args.distance is not None else max(0.15, model.stat.extent * 1.5)
            )
            viewer.cam.azimuth = args.azimuth
            viewer.cam.elevation = args.elevation
            if args.body_axes:
                viewer.opt.frame = mujoco.mjtFrame.mjFRAME_BODY
            viewer.opt.geomgroup[2] = not args.collision
            viewer.opt.geomgroup[3] = args.collision
            if args.hide_ground:
                viewer.opt.geomgroup[0] = False
        while viewer.is_running():
            tick = time.perf_counter()
            if args.seconds and tick - started >= args.seconds:
                break
            mujoco.mj_step(model, data, nstep=frame_steps)
            steps += frame_steps
            viewer.sync()
            syncs += 1
            time.sleep(max(0, frame_steps * model.opt.timestep - (time.perf_counter() - tick)))
    report = {
        "scene": args.scene.name,
        "native_viewer_loop_completed": True,
        "collision_view": args.collision,
        "body_axes": args.body_axes,
        "ground_render_hidden": args.hide_ground,
        "initial_camera_azimuth": args.azimuth,
        "initial_camera_elevation": args.elevation,
        "initial_camera_distance_m": float(
            args.distance if args.distance is not None else max(0.15, model.stat.extent * 1.5)
        ),
        "steps": steps,
        "syncs": syncs,
        "simulated_seconds": float(data.time),
        "timestep_s": float(model.opt.timestep),
        "wall_seconds": time.perf_counter() - started,
        "warning_counts": [int(w.number) for w in data.warning],
        "note": "Window visibility and appearance must be verified separately.",
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
