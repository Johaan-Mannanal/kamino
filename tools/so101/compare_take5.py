"""Audit take 5 against take 3 and render unchanged, unverified baseline FK."""

import argparse
import hashlib
import json
import math
import zipfile
from pathlib import Path

import mujoco
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

from photo2sim.simulation.pose_review import audit_capture

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "examples/so101/windows/reference-20261024-take5"
PREVIOUS = ROOT / "examples/so101/windows/reference-20261024-take3"
BUNDLE = ROOT / "examples/assemblies/so101-guided/api-workflow/simulation.zip"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    out = parser.parse_args().output_dir
    out.mkdir(parents=True, exist_ok=False)
    integrity = json.loads((SOURCE / "integrity.json").read_text())
    for name, entry in integrity.items():
        path = SOURCE / name
        if digest(path) != entry["sha256"] or path.stat().st_size != entry["bytes"]:
            raise ValueError(f"Evidence integrity failed: {name}")
    current, previous = audit_capture(SOURCE), audit_capture(PREVIOUS)
    if (
        current["source_hashes"]["calibration.json"]
        != previous["source_hashes"]["calibration.json"]
    ):
        raise ValueError("Calibration changed between takes")
    with zipfile.ZipFile(BUNDLE) as archive:
        for name in archive.namelist():
            if not (out / "bundle" / name).resolve().is_relative_to((out / "bundle").resolve()):
                raise ValueError("Unexpected fixture archive path")
        archive.extractall(out / "bundle")
    model = mujoco.MjModel.from_xml_path(str(out / "bundle/scene.xml"))
    model.vis.global_.offwidth = 800
    model.vis.global_.offheight = 600
    model.vis.headlight.ambient[:] = 0.4
    model.vis.headlight.diffuse[:] = 0.8
    data = mujoco.MjData(model)
    mapping = {}
    for signal, stats in current["signals"].items():
        name = signal.removesuffix(".pos")
        joint = model.joint(name)
        expected_unit = "normalized_0_100" if name == "gripper" else "degrees"
        if stats["declared_unit"] != expected_unit:
            raise ValueError(f"Unexpected unit: {signal}")
        angle = 0.0 if name == "gripper" else math.radians(stats["median"])
        data.qpos[joint.qposadr[0]] = angle
        lo, hi = model.jnt_range[joint.id]
        mapping[name] = {
            **stats,
            "delta_from_take3": stats["median"] - previous["signals"][signal]["median"],
            "display_angle_rad": angle,
            "range_excess_deg": math.degrees(max(float(lo) - angle, angle - float(hi), 0)),
            "assumption": "Display-only zero; no gripper conversion"
            if name == "gripper"
            else "Unverified positive sign and zero offset, identical to take 3",
            "verified": False,
        }
    mujoco.mj_forward(model, data)
    if not np.isfinite(data.xpos).all():
        raise ValueError("Nonfinite FK")
    points = []
    for gid in range(model.ngeom):
        if model.geom_group[gid] == 2:
            mid = int(model.geom_dataid[gid])
            start, count = model.mesh_vertadr[mid], model.mesh_vertnum[mid]
            points.append(
                model.mesh_vert[start : start + count] @ data.geom_xmat[gid].reshape(3, 3).T
                + data.geom_xpos[gid]
            )
    vertices = np.concatenate(points)
    camera = mujoco.MjvCamera()
    mujoco.mjv_defaultCamera(camera)
    camera.lookat[:] = (vertices.min(axis=0) + vertices.max(axis=0)) / 2
    camera.distance = float(np.linalg.norm(np.ptp(vertices, axis=0))) * 1.35
    camera.elevation = -12
    options = mujoco.MjvOption()
    options.geomgroup[3] = 0
    font = ImageFont.load_default(size=20)
    sheet = Image.new("RGB", (1600, 1840), "#15191c")
    draw = ImageDraw.Draw(sheet)
    draw.text((16, 8), "TAKE 5 | unverified FK mapping | NOT an accuracy test", font=font)
    for i, view in enumerate(("front", "side")):
        with Image.open(SOURCE / f"photos/{view}.png") as original:
            thumb = ImageOps.contain(original.convert("RGB"), (800, 555))
        sheet.paste(thumb, (800 * i + (800 - thumb.width) // 2, 70))
        draw.text((16 + 800 * i, 40), f"{view} | mirroring unconfirmed", font=font)
    with mujoco.Renderer(model, height=600, width=800) as renderer:
        for i, azimuth in enumerate((0, 90, 180, 270)):
            camera.azimuth = azimuth
            renderer.update_scene(data, camera=camera, scene_option=options)
            frame = Image.fromarray(renderer.render())
            label = ImageDraw.Draw(frame)
            label.rectangle((0, 0, 800, 64), fill="#15191c")
            label.text((12, 8), "UNVERIFIED +sign / zero offset | static FK", font=font)
            label.text((12, 34), f"Azimuth {azimuth} | jaw 0 rad placeholder", font=font)
            frame.save(out / f"render-{azimuth}.png")
            sheet.paste(frame, (800 * (i % 2), 640 + 600 * (i // 2)))
    sheet.save(out / "comparison.jpg", quality=92)
    report = {
        "source_commit": "3ec35e6b50e32c6e4bb4d84d2500e467e1dfe7de",
        "scope": "Offline baseline FK and evidence audit, not physical accuracy validation",
        "mujoco_version": mujoco.__version__,
        "bundle_sha256": digest(BUNDLE),
        "scene_sha256": digest(out / "bundle/scene.xml"),
        "integrity_manifest_sha256": digest(SOURCE / "integrity.json"),
        "evidence_integrity_passed": True,
        "calibration_unchanged": True,
        "pairing": json.loads((SOURCE / "pairing.json").read_text()),
        "capture_audit": current,
        "joint_mapping_hypothesis": mapping,
        "hardware_mapping_verified": False,
        "physical_accuracy_verified": False,
        "dynamics_steps": 0,
        "base_origin_world_m": data.xpos[model.body("base").id].tolist(),
        "joint_anchor_positions_m": {n: data.xanchor[model.joint(n).id].tolist() for n in mapping},
        "render_camera": {
            "azimuths_deg": [0, 90, 180, 270],
            "elevation_deg": -12,
            "lookat_m": camera.lookat.tolist(),
            "distance_m": float(camera.distance),
            "fitted_to_photos": False,
        },
        "limitations": [
            "Several joints changed together; signs and offsets are not identified independently.",
            "One approximate jaw gap does not determine normalized-value to angle conversion.",
            "Photo mirroring, camera calibration and full mounting transform remain unverified.",
            "No fitting, clamping, new limits, calibration changes or hardware commands.",
            "Base height remains the fixture's free-space assumption, not a measured table pose.",
            "CAD structural subset omits servos, wrist camera, wires and clamps.",
        ],
    }
    (out / "report.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"samples": current["samples"], "mapping": mapping}, indent=2))


if __name__ == "__main__":
    main()
