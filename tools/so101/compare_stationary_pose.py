"""Render unverified take-to-model hypotheses offline; no hardware or dynamics.

These are candidate conversions, not fitted calibration. Values are never clipped.
No joint direction is inferred from photographs, whose mirror status may be unknown.
"""

import argparse
import hashlib
import json
from pathlib import Path

import mujoco
import numpy as np
from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scene", type=Path)
    parser.add_argument("capture", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if args.output_dir.exists():
        raise FileExistsError(args.output_dir)
    rows = [json.loads(x) for x in (args.capture / "observations.jsonl").read_text().splitlines()]
    meta = json.loads((args.capture / "capture.json").read_text())
    model = mujoco.MjModel.from_xml_path(str(args.scene.resolve()))
    record = json.loads((args.scene.parent / "assembly.json").read_text())
    names = [j["name"] for j in record["joints"] if j["kind"] == "revolute"]
    signals = {}
    for name in names:
        key = name + ".pos"
        values = np.array([r["observation"][key] for r in rows])
        expected_unit = "normalized_0_100" if name == "gripper" else "degrees"
        if meta["units"][key] != expected_unit or not len(values) or not np.isfinite(values).all():
            raise ValueError(
                "Candidate rendering requires finite degree/body and normalized gripper data"
            )
        signals[name] = {
            "unit": meta["units"][key],
            "median": float(np.median(values)),
            "minimum": float(values.min()),
            "maximum": float(values.max()),
            "span": float(np.ptp(values)),
        }
    args.output_dir.mkdir(parents=True)
    variants = []
    lo, hi = model.joint("gripper").range
    body_maps = {
        n: {
            "sign": 1,
            "offset_rad": 0,
            "radians_per_unit": np.pi / 180,
            "status": "assumed, not verified",
        }
        for n in names
        if n != "gripper"
    }
    policies = [
        ("A_percent_to_model_range", float((hi - lo) / 100), float(lo)),
        ("B_percent_number_as_degrees", float(np.pi / 180), 0.0),
    ]
    data = mujoco.MjData(model)
    options = mujoco.MjvOption()
    options.geomgroup[2], options.geomgroup[3] = True, False
    with mujoco.Renderer(model, height=480, width=640) as renderer:
        for label, slope, offset in policies:
            mujoco.mj_resetData(model, data)
            maps = {
                **body_maps,
                "gripper": {
                    "sign": 1,
                    "offset_rad": offset,
                    "radians_per_unit": slope,
                    "status": "alternative heuristic, not verified",
                },
            }
            qpos, violations = {}, []
            for name in names:
                conversion = maps[name]
                value = (
                    signals[name]["median"] * conversion["radians_per_unit"]
                    + conversion["offset_rad"]
                )
                data.qpos[model.joint(name).qposadr[0]] = value
                qpos[name] = float(value)
                low, high = model.joint(name).range
                if value < low or value > high:
                    violations.append(
                        {
                            "joint": name,
                            "candidate_rad": float(value),
                            "limits_rad": [float(low), float(high)],
                            "outside_by_rad": float(max(low - value, value - high)),
                        }
                    )
            mujoco.mj_forward(model, data)
            vertices = []
            for link in record["links"]:
                gid = model.geom("visual_" + link["name"]).id
                mid = int(model.geom_dataid[gid])
                start, count = int(model.mesh_vertadr[mid]), int(model.mesh_vertnum[mid])
                vertices.append(
                    model.mesh_vert[start : start + count] @ data.geom_xmat[gid].reshape(3, 3).T
                    + data.geom_xpos[gid]
                )
            points = np.concatenate(vertices)
            centre = (points.min(axis=0) + points.max(axis=0)) / 2
            images = []
            for view, azimuth in [("end_on", 0), ("side", 90)]:
                camera = mujoco.MjvCamera()
                mujoco.mjv_defaultCamera(camera)
                camera.lookat[:] = centre
                camera.distance = max(float(np.ptp(points, axis=0).max()) * 2, 0.45)
                camera.azimuth, camera.elevation = azimuth, -12
                renderer.update_scene(data, camera=camera, scene_option=options)
                panel = Image.fromarray(renderer.render())
                draw = ImageDraw.Draw(panel)
                draw.text(
                    (12, 12), f"{label} | {view} | UNVERIFIED SIMULATION CANDIDATE", fill="white"
                )
                draw.text(
                    (12, 30),
                    "Kinematic forward only; no stepping/clipping; assumed root Z=0.15 m",
                    fill="white",
                )
                draw.text(
                    (12, 48),
                    "Shoulder-lift exceeds model limit; camera not matched to photo",
                    fill="yellow",
                )
                filename = f"{label}-{view}.png"
                panel.save(args.output_dir / filename)
                images.append(filename)
            variants.append(
                {
                    "name": label,
                    "conversions": maps,
                    "qpos_rad": qpos,
                    "joint_limit_violations": violations,
                    "renders": images,
                    "adopted_for_hardware": False,
                }
            )
    report = {
        "scope": "Unverified static candidate render; not physical fit, dynamics or pose calibration",
        "capture_id": args.capture.name,
        "sample_count": len(rows),
        "signals": signals,
        "calibration_sha256": meta["calibration_sha256"],
        "scene_sha256": hashlib.sha256(args.scene.read_bytes()).hexdigest(),
        "mujoco_version": mujoco.__version__,
        "candidates": variants,
        "photograph_mirror_status": {"front_oblique": "unknown", "side_oblique": "unknown"},
        "photo_directions_used_to_infer_signs": False,
        "hardware_mapping_verified": False,
        "gripper_conversion_verified": False,
        "root_pose": record["root_pose"],
        "root_is_measured": False,
        "jaw_opening_mm": None,
        "base_table_geometry": None,
    }
    (args.output_dir / "comparison.json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        json.dumps(
            {"signals": signals, "candidates": [v["joint_limit_violations"] for v in variants]}
        )
    )


if __name__ == "__main__":
    main()
