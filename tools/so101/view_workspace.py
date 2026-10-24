"""View a generated SO101 workspace. R resets simulation; no hardware access."""

import argparse
import threading
import time
from pathlib import Path

import mujoco
import mujoco.viewer

from photo2sim.simulation.workspace import reset_workspace


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scene", type=Path)
    parser.add_argument("--collision", action="store_true")
    args = parser.parse_args()
    model = mujoco.MjModel.from_xml_path(str(args.scene.resolve()))
    data = mujoco.MjData(model)
    reset_workspace(model, data)
    requested = threading.Event()

    def key_callback(key):
        if key in (ord("r"), ord("R")):
            requested.set()

    print("SIMULATION ONLY: assumed layout/servo dynamics. Press R to reset; close to exit.")
    steps_per_frame = max(1, round(1 / (60 * model.opt.timestep)))
    with mujoco.viewer.launch_passive(model, data, key_callback=key_callback) as viewer:
        with viewer.lock():
            viewer.cam.lookat[:] = model.stat.center
            viewer.cam.distance = model.stat.extent * 1.5
            viewer.cam.azimuth = 135
            viewer.cam.elevation = -25
            viewer.opt.geomgroup[2] = not args.collision
            viewer.opt.geomgroup[3] = args.collision
            viewer.opt.geomgroup[4] = args.collision
        while viewer.is_running():
            started = time.perf_counter()
            if requested.is_set():
                reset_workspace(model, data)
                requested.clear()
            mujoco.mj_step(model, data, nstep=steps_per_frame)
            viewer.sync()
            time.sleep(
                max(0, steps_per_frame * model.opt.timestep - (time.perf_counter() - started))
            )


if __name__ == "__main__":
    main()
