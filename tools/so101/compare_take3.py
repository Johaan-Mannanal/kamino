"""Reproduce the take-3 diagnostic pose; offline FK only, never hardware control."""

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
SOURCE = ROOT / "examples/so101/windows/reference-20261024-take3"
BUNDLE = ROOT / "examples/assemblies/so101-guided/api-workflow/simulation.zip"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    out = args.output_dir
    out.mkdir(parents=True, exist_ok=False)
    audit = audit_capture(SOURCE)
    pairing = json.loads((SOURCE / "pairing.json").read_text())
    for item in pairing["images"]:
        assert digest(SOURCE / item["path"]) == item["sha256"]
    # The archive is the locally reviewed API-produced fixture, not an arbitrary upload.
    with zipfile.ZipFile(BUNDLE) as archive:
        for name in archive.namelist():
            assert (out / "bundle" / name).resolve().is_relative_to((out / "bundle").resolve())
        archive.extractall(out / "bundle")
    model = mujoco.MjModel.from_xml_path(str(out / "bundle/scene.xml"))
    # Rendering resolution only; source XML, geometry and physics remain unchanged.
    model.vis.global_.offwidth = 800
    model.vis.global_.offheight = 600
    model.vis.headlight.ambient[:] = 0.4
    model.vis.headlight.diffuse[:] = 0.8
    data = mujoco.MjData(model)
    mapping = {}
    for signal, values in audit["signals"].items():
        name = signal.removesuffix(".pos")
        joint = model.joint(name)
        # Deliberately no fitting, clamping, servo writes, or dynamics stepping.
        if name == "gripper":
            assert values["declared_unit"] == "normalized_0_100"
            angle = 0.0
            reason = "Display-only zero placeholder; normalized observation is NOT converted"
        else:
            assert values["declared_unit"] == "degrees"
            angle = math.radians(values["median"])
            reason = "Unverified baseline: positive sign, zero offset, degrees to radians"
        data.qpos[joint.qposadr[0]] = angle
        lo, hi = model.jnt_range[joint.id]
        mapping[name] = {
            **values,
            "display_angle_rad": angle,
            "assumption": reason,
            "verified": False,
            "model_range_rad": [float(lo), float(hi)],
            "range_excess_deg": math.degrees(max(float(lo) - angle, angle - float(hi), 0)),
        }
    mujoco.mj_forward(model, data)
    assert np.isfinite(data.xpos).all()
    report = {
        "scope": "Qualitative diagnostic FK, not a validated hardware pose or motion replay",
        "source_commit": "d07d713c3cb57f1316bd0950fc48ba71f4478f9d",
        "mujoco_version": mujoco.__version__,
        "bundle_sha256": digest(BUNDLE),
        "scene_sha256": digest(out / "bundle/scene.xml"),
        "pairing_sha256": digest(SOURCE / "pairing.json"),
        "capture_integrity_passed": audit["capture_integrity_passed"],
        "samples": audit["samples"],
        "elapsed_span_s": audit["elapsed_span_s"],
        "association": pairing["status"],
        "hardware_synchronized": False,
        "hardware_mapping_verified": False,
        "physical_accuracy_verified": False,
        "dynamics_steps": 0,
        "display_settings": {
            "size_px": [800, 600],
            "headlight_ambient": 0.4,
            "headlight_diffuse": 0.8,
        },
        "joint_mapping_hypothesis": mapping,
        "base_origin_world_m": data.xpos[model.body("base").id].tolist(),
        "joint_anchor_positions_m": {n: data.xanchor[model.joint(n).id].tolist() for n in mapping},
        "limitations": [
            "Positive signs and zero offsets are a baseline hypothesis only.",
            "Out-of-range angles are retained for diagnostic FK, never clipped or commanded.",
            "Gripper zero and range endpoints are display cases, not estimated jaw opening.",
            "Camera angles are illustrative; no intrinsics/extrinsics or pixel alignment fitted.",
            "Photos are resized only for the comparison sheet; not flipped or perspective corrected.",
            "Possible front-photo mirroring remains unconfirmed; do not infer signs from it.",
            "Base height 0.15 m is the existing free-space test assumption, not tabletop calibration.",
            "CAD structural subset omits servos, camera, wiring and mounting clamps.",
        ],
    }
    vertices = []
    for gid in range(model.ngeom):
        if model.geom_group[gid] != 2:
            continue
        mid = int(model.geom_dataid[gid])
        start, count = model.mesh_vertadr[mid], model.mesh_vertnum[mid]
        vertices.append(
            model.mesh_vert[start : start + count] @ data.geom_xmat[gid].reshape(3, 3).T
            + data.geom_xpos[gid]
        )
    points = np.concatenate(vertices)
    center = (points.min(axis=0) + points.max(axis=0)) / 2
    camera = mujoco.MjvCamera()
    mujoco.mjv_defaultCamera(camera)
    camera.lookat[:] = center
    camera.distance = float(np.linalg.norm(np.ptp(points, axis=0))) * 1.35
    camera.elevation = -12
    options = mujoco.MjvOption()
    options.geomgroup[3] = 0
    font = ImageFont.load_default(size=20)
    renders = []
    with mujoco.Renderer(model, height=600, width=800) as renderer:
        cases = [(f"azimuth {az} | jaw 0 rad placeholder", az, 0.0) for az in (0, 90, 180, 270)]
        cases += [
            (f"Jaw range endpoint {angle:.3f} rad | NOT measured", 90, float(angle))
            for angle in model.jnt_range[model.joint("gripper").id]
        ]
        report["render_cases"] = []
        for i, (label, azimuth, jaw) in enumerate(cases):
            camera.azimuth = azimuth
            data.qpos[model.joint("gripper").qposadr[0]] = jaw
            mujoco.mj_forward(model, data)
            renderer.update_scene(data, camera=camera, scene_option=options)
            frame = Image.fromarray(renderer.render())
            draw = ImageDraw.Draw(frame)
            draw.rectangle((0, 0, 800, 64), fill="#15191c")
            draw.text(
                (12, 8), "UNVERIFIED mapping | static FK | no dynamics", font=font, fill="white"
            )
            draw.text((12, 34), label, font=font, fill="white")
            frame.save(out / f"render-{i}.png")
            renders.append(frame)
            report["render_cases"].append(
                {
                    "file": f"render-{i}.png",
                    "azimuth_deg": azimuth,
                    "elevation_deg": float(camera.elevation),
                    "lookat_m": center.tolist(),
                    "distance_m": float(camera.distance),
                    "jaw_angle_rad": jaw,
                }
            )
    sheet = Image.new("RGB", (1600, 1840), "#15191c")
    draw = ImageDraw.Draw(sheet)
    draw.text(
        (18, 10),
        "Take 3: operator-paired photos vs UNVERIFIED angle mapping (not an accuracy test)",
        fill="white",
        font=font,
    )
    for i, item in enumerate(pairing["images"]):
        with Image.open(SOURCE / item["path"]) as original:
            thumb = ImageOps.contain(original.convert("RGB"), (800, 555))
        sheet.paste(thumb, (800 * i + (800 - thumb.width) // 2, 70))
        draw.text(
            (18 + 800 * i, 40), item["view"] + " | original orientation", fill="white", font=font
        )
    for i, frame in enumerate(renders[:4]):
        sheet.paste(frame, (800 * (i % 2), 640 + 600 * (i // 2)))
    sheet.save(out / "all-views.jpg", quality=92)
    # Select the front-facing and side-facing views; no photo or model geometry is fitted.
    paired = sheet.crop((0, 0, 1600, 1240))
    paired.paste(renders[2], (0, 640))
    paired.paste(renders[1], (800, 640))
    paired.save(out / "comparison.jpg", quality=92)
    with (out / "report.json").open("x") as stream:
        json.dump(report, stream, indent=2, allow_nan=False)
        stream.write("\n")
    with (out / "capture-audit.json").open("x") as stream:
        json.dump(audit, stream, indent=2, allow_nan=False)
        stream.write("\n")
    print(
        json.dumps({"output": str(out), "samples": audit["samples"], "mapping": mapping}, indent=2)
    )


if __name__ == "__main__":
    main()
