"""Native simulation-only playback of the assembly validator's exact target sequence.

Space starts two trials; R resets and stops. No hardware libraries are imported.
Collision mode shows convex hulls, including surfaces filling concavities.
"""

import argparse
import json
import threading
import time
from pathlib import Path

import mujoco
import mujoco.viewer
import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scene", type=Path)
    parser.add_argument("--events", type=Path, required=True)
    parser.add_argument("--collision", action="store_true")
    args = parser.parse_args()
    record = json.loads((args.scene.parent / "assembly.json").read_text())
    model = mujoco.MjModel.from_xml_path(str(args.scene.resolve()))
    data = mujoco.MjData(model)
    hinges = [j for j in record["joints"] if j["kind"] == "revolute"]
    phases = []
    for trial in range(2):
        for joint in hinges:
            lo, hi = joint["limits_rad"]
            for target in (hi * 0.5, lo * 0.5, 0.0):
                phases.append((trial, joint["name"], target))
    start_request, reset_request = threading.Event(), threading.Event()

    def key_callback(key):
        if key == ord(" "):
            start_request.set()
        elif key in (ord("r"), ord("R")):
            reset_request.set()

    args.events.parent.mkdir(parents=True, exist_ok=True)
    with args.events.open("x") as log:

        def event(kind, **fields):
            row = {"event": kind, "simulated_time_s": float(data.time), **fields}
            log.write(json.dumps(row) + "\n")
            log.flush()
            print(json.dumps(row), flush=True)

        mujoco.mj_forward(model, data)
        event("initial", qpos=data.qpos.tolist(), ctrl=data.ctrl.tolist())
        index, remaining, running = 0, 0, False
        with mujoco.viewer.launch_passive(
            model, data, key_callback=key_callback, show_left_ui=False, show_right_ui=False
        ) as viewer:
            with viewer.lock():
                viewer.cam.lookat[:] = [0.15, 0, 0.35]
                viewer.cam.distance = 0.9
                viewer.cam.azimuth = 130
                viewer.cam.elevation = -25
                viewer.opt.geomgroup[2] = not args.collision
                viewer.opt.geomgroup[3] = args.collision
                viewer.opt.flags[mujoco.mjtVisFlag.mjVIS_CONVEXHULL] = args.collision
            while viewer.is_running():
                started = time.perf_counter()
                if reset_request.is_set() or start_request.is_set():
                    running = start_request.is_set()
                    event("restart" if running else "R_reset_requested")
                    mujoco.mj_resetData(model, data)
                    mujoco.mj_forward(model, data)
                    event("reset", qpos=data.qpos.tolist(), ctrl=data.ctrl.tolist())
                    index, remaining = 0, 0
                    reset_request.clear()
                    start_request.clear()
                if running:
                    trial, name, target = phases[index]
                    if remaining == 0:
                        if index and phases[index - 1][0] != trial:
                            mujoco.mj_resetData(model, data)
                            mujoco.mj_forward(model, data)
                            event("trial_reset", qpos=data.qpos.tolist(), ctrl=data.ctrl.tolist())
                        data.ctrl[:] = 0
                        data.ctrl[model.actuator("drive_" + name).id] = target
                        remaining = round(2.0 / model.opt.timestep)
                        event("phase_start", trial=trial, joint=name, target_rad=target)
                    count = min(remaining, max(1, round(1 / (60 * model.opt.timestep))))
                    mujoco.mj_step(model, data, nstep=count)
                    remaining -= count
                    if not np.isfinite(data.qpos).all() or not np.isfinite(data.qvel).all():
                        raise RuntimeError("Nonfinite native playback state")
                    if remaining == 0:
                        actual = float(data.qpos[model.joint(name).qposadr[0]])
                        errors = [
                            abs(
                                float(data.qpos[model.joint(j["name"]).qposadr[0]])
                                - float(data.ctrl[model.actuator("drive_" + j["name"]).id])
                            )
                            for j in hinges
                        ]
                        event(
                            "phase_end",
                            trial=trial,
                            joint=name,
                            target_rad=target,
                            actual_rad=actual,
                            max_tracking_error_rad=max(errors),
                            warnings=sum(int(w.number) for w in data.warning),
                        )
                        index += 1
                        if index == len(phases):
                            running = False
                            event("complete", qpos=data.qpos.tolist(), ctrl=data.ctrl.tolist())
                viewer.sync()
                time.sleep(max(0, 1 / 60 - (time.perf_counter() - started)))


if __name__ == "__main__":
    main()
