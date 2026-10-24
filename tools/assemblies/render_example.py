"""Render three simulated hinge states; this is offscreen evidence, not viewer acceptance."""

import argparse
from pathlib import Path

import mujoco
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("scene", type=Path)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
if args.output.exists():
    raise FileExistsError(args.output)
m = mujoco.MjModel.from_xml_path(str(args.scene))
if m.nu != 1:
    raise ValueError("This illustration is for the one-hinge synthetic fixture")
d = mujoco.MjData(m)
frames = []
with mujoco.Renderer(m, height=400, width=450) as renderer:
    cam = mujoco.MjvCamera()
    mujoco.mjv_defaultCamera(cam)
    cam.lookat[:] = [0.07, 0, 0.28]
    cam.distance = 0.65
    cam.azimuth = 120
    cam.elevation = -35
    opt = mujoco.MjvOption()
    opt.geomgroup[3] = 0
    for target in [0.4, -0.4, 0]:
        d.ctrl[0] = target
        for _ in range(round(2 / m.opt.timestep)):
            mujoco.mj_step(m, d)
        mujoco.mj_forward(m, d)
        renderer.update_scene(d, camera=cam, scene_option=opt)
        panel = Image.fromarray(renderer.render())
        ImageDraw.Draw(panel).text(
            (12, 12), f"Target {target:+.2f} rad | observed {d.qpos[0]:+.4f} rad", fill="white"
        )
        frames.append(panel)
canvas = Image.new("RGB", (1350, 440), "#101316")
for i, frame in enumerate(frames):
    canvas.paste(frame, (i * 450, 40))
ImageDraw.Draw(canvas).text(
    (12, 12),
    "Synthetic two-link assembly | offscreen MuJoCo simulation | assumed properties | not a reconstructed robot",
    fill="white",
)
args.output.parent.mkdir(parents=True, exist_ok=True)
canvas.save(args.output)
print(args.output)
