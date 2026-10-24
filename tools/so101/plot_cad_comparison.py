import argparse
from pathlib import Path

import matplotlib
import trimesh

matplotlib.use("Agg")
import matplotlib.pyplot as plt

parser = argparse.ArgumentParser(description="Plot nominal CAD/model surface projections")
parser.add_argument("--inspection-dir", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
out = args.inspection_dir
if args.output.exists():
    raise FileExistsError(args.output)
robot_root = Path(__file__).resolve().parents[2] / "third_party/robotstudio_so101/assets"
fig, axs = plt.subplots(2, 2, figsize=(12, 8), layout="constrained")
selected = [
    ("upper_arm_so101_v1", "Upper arm", (0, 2)),
    ("under_arm_so101_v1", "Lower arm", (0, 2)),
    ("wrist_roll_follower_so101_v1", "Fixed jaw / wrist", (0, 2)),
    ("moving_jaw_so101_v1", "Moving jaw", (0, 1)),
]
for ax, (name, title, axes) in zip(axs.flat, selected):
    cad = trimesh.load(out / (name + "-cad.ply"), force="mesh")
    model = trimesh.load(robot_root / (name + ".stl"), force="mesh")
    model.apply_scale(1000)
    for mesh, color, label, seed in [
        (cad, "#2879bd", "CAD", 101),
        (model, "#ed8829", "MuJoCo mesh", 102),
    ]:
        pts, _ = trimesh.sample.sample_surface(mesh, 6000, seed=seed)
        ax.scatter(
            pts[:, axes[0]], pts[:, axes[1]], s=1, alpha=0.35, c=color, label=label, rasterized=True
        )
    ax.set_aspect("equal")
    ax.set_title(title)
    ax.set_xlabel("XYZ"[axes[0]] + " (mm)")
    ax.set_ylabel("XYZ"[axes[1]] + " (mm)")
    ax.grid(alpha=0.15)
axs[0, 0].legend(markerscale=5, loc="upper right")
fig.suptitle("SO101 CAD and simulator geometry — local part frames", fontsize=17)
fig.supxlabel(
    "Nominal geometry only • sampled surface projections • no fitted alignment or rescaling beyond metres → mm",
    fontsize=10,
)
fig.savefig(args.output, dpi=160)
