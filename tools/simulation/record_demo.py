"""Record a labelled offscreen MuJoCo GIF; separate from native-window evidence."""

import argparse
import json
import math
import time
from pathlib import Path

import mujoco
from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scene", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Choose a new GIF path; existing evidence is preserved")
    started = time.perf_counter()
    model = mujoco.MjModel.from_xml_path(str(args.scene.resolve()))
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    camera = mujoco.MjvCamera()
    mujoco.mjv_defaultCamera(camera)
    camera.lookat[:] = model.stat.center
    camera.distance = max(0.18, model.stat.extent * 0.7)
    camera.azimuth = 45
    camera.elevation = -20
    options = mujoco.MjvOption()
    mujoco.mjv_defaultOption(options)
    options.geomgroup[2] = True
    options.geomgroup[3] = False
    frame_steps = max(1, round(1 / (30 * model.opt.timestep)))
    frames = []
    with mujoco.Renderer(model, height=480, width=640) as renderer:
        for index in range(31):
            if index:
                mujoco.mj_step(model, data, nstep=frame_steps)
                mujoco.mj_forward(model, data)
            renderer.update_scene(data, camera=camera, scene_option=options)
            image = Image.fromarray(renderer.render())
            draw = ImageDraw.Draw(image)
            draw.rectangle((0, 0, 640, 42), fill=(20, 20, 20))
            draw.text(
                (10, 5),
                "MuJoCo offscreen replay | approx. 4x slow motion | BOX collision",
                fill="white",
            )
            draw.text(
                (10, 23),
                f"Simulated time: {data.time:.4f} s | properties estimated, not measured",
                fill="white",
            )
            frames.append(image)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    durations = [800] + [130] * (len(frames) - 1)
    frames[0].save(args.output, save_all=True, append_images=frames[1:], duration=durations, loop=0)
    report = {
        "kind": "offscreen_rendered_replay_not_native_screen_recording",
        "scene": args.scene.name,
        "frames": len(frames),
        "image_dimensions": [640, 480],
        "timestep_s": float(model.opt.timestep),
        "simulated_duration_s": float(data.time),
        "playback_duration_s": math.fsum(durations) / 1000,
        "wall_clock_generation_s": time.perf_counter() - started,
        "warning_counts": [int(w.number) for w in data.warning],
        "camera": {"azimuth": 45, "elevation": -20, "distance_m": float(camera.distance)},
        "note": "Visual replay only. Separate native screenshots and headless reports establish those checks.",
    }
    args.output.with_suffix(".json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
