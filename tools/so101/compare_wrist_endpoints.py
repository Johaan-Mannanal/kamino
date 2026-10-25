"""Offline FK candidate comparison of paired stationary endpoints; no hardware API."""

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
SOURCE = ROOT / "examples/so101/windows/wrist-comparison-20261024"
BUNDLE = ROOT / "examples/assemblies/so101-guided/api-workflow/simulation.zip"
NAMES = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")
CANDIDATES = (("A_positive_zero", 1, 0), ("B_negative_zero", -1, 0),
              ("C_positive_minus90", 1, -90), ("D_negative_plus90", -1, 90))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def angle_between(a, b):
    cosine = np.clip((np.trace(b @ a.T) - 1) / 2, -1, 1)
    return float(np.degrees(np.arccos(cosine)))


def transform(data, body):
    result = np.eye(4)
    result[:3, :3] = data.body(body).xmat.reshape(3, 3)
    result[:3, 3] = data.body(body).xpos
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    out = parser.parse_args().output_dir
    out.mkdir(parents=True, exist_ok=False)
    for name, item in json.loads((SOURCE / "integrity.json").read_text()).items():
        path = ROOT / name
        if digest(path) != item["sha256"] or path.stat().st_size != item["bytes"]:
            raise ValueError(f"Evidence integrity failure: {name}")
    pairing = json.loads((SOURCE / "pairing.json").read_text())
    audits = {label: audit_capture(SOURCE / "captures" / directory) for label, directory in (
        ("baseline", "wrist-baseline-20261024-155719"),
        ("changed", "wrist-changed-20261024-160156"),
        ("earlier_alternative", "wrist-baseline-20261024-155247"))}
    if len({a["source_hashes"]["calibration.json"] for a in audits.values()}) != 1:
        raise ValueError("Calibration identity differs")
    values = {label: {n: a["signals"][n + ".pos"]["median"] for n in NAMES}
              for label, a in audits.items()}
    for audit in audits.values():
        for n in NAMES:
            expected = "normalized_0_100" if n == "gripper" else "degrees"
            if audit["signals"][n + ".pos"]["declared_unit"] != expected:
                raise ValueError("Unexpected declared units")
    deltas = {n: values["changed"][n] - values["baseline"][n] for n in NAMES}
    with zipfile.ZipFile(BUNDLE) as archive:
        dest = (out / "bundle").resolve()
        if any(not (dest / n).resolve().is_relative_to(dest) for n in archive.namelist()):
            raise ValueError("Unsafe bundle path")
        archive.extractall(dest)
    scene = out / "bundle/scene.xml"
    font = ImageFont.load_default(size=17)
    small = ImageFont.load_default(size=14)
    results = []
    world_sheet = Image.new("RGB", (2400, 1840), "#15191c")
    local_sheet = Image.new("RGB", (1200, 1840), "#15191c")
    for index, (candidate, sign, offset) in enumerate(CANDIDATES):
        model = mujoco.MjModel.from_xml_path(str(scene.resolve()))
        model.vis.global_.offwidth = 600
        model.vis.global_.offheight = 440
        model.vis.headlight.ambient[:] = 0.5
        for n, rgba in (("lower_arm", [0.1, 0.65, 0.85, 1]),
                        ("wrist", [0.8, 0.3, 0.85, 1]),
                        ("gripper", [0.3, 0.85, 0.4, 1]),
                        ("moving_jaw_so101_v1", [0.95, 0.8, 0.2, 1])):
            model.geom("visual_" + n).rgba[:] = rgba
        data = mujoco.MjData(model)
        root_pos, root_quat = model.body("base").pos.copy(), model.body("base").quat.copy()
        states = {}
        world_frames = []
        for label in ("baseline", "changed"):
            mujoco.mj_resetData(model, data)
            qpos, violations = {}, []
            jaw_lo, jaw_hi = model.joint("gripper").range
            for n in NAMES:
                u = values[label][n]
                angle = (float(jaw_lo + u / 100 * (jaw_hi - jaw_lo)) if n == "gripper"
                         else math.radians(sign * u + offset) if n == "wrist_flex"
                         else math.radians(u))
                data.qpos[model.joint(n).qposadr[0]] = angle
                qpos[n] = angle
                lo, hi = model.joint(n).range
                excess = max(float(lo) - angle, angle - float(hi), 0)
                if excess:
                    violations.append({"joint": n, "q_deg": math.degrees(angle),
                                       "limits_deg": np.degrees([lo, hi]).tolist(),
                                       "excess_deg": math.degrees(excess)})
            mujoco.mj_forward(model, data)
            if not np.isfinite(data.xmat).all():
                raise ValueError("Nonfinite forward kinematics")
            forearm = transform(data, "lower_arm")
            wrist = transform(data, "wrist")
            gripper = transform(data, "gripper")
            relative = np.linalg.inv(forearm) @ wrist
            saved_jaw = data.qpos[model.joint("gripper").qposadr[0]]
            data.qpos[model.joint("gripper").qposadr[0]] = 0
            mujoco.mj_forward(model, data)
            assert np.allclose(np.linalg.inv(transform(data, "lower_arm")) @ transform(data, "wrist"), relative, atol=1e-12)
            data.qpos[model.joint("gripper").qposadr[0]] = saved_jaw
            mujoco.mj_forward(model, data)
            states[label] = {"qpos_rad": qpos, "limit_conflicts": violations,
                             "world_T_forearm": forearm.tolist(), "world_T_wrist": wrist.tolist(),
                             "world_T_gripper": gripper.tolist(),
                             "forearm_T_wrist": relative.tolist(),
                             "forearm_T_gripper": (np.linalg.inv(forearm) @ gripper).tolist(),
                             "forearm_wrist_z_heading_deg": math.degrees(math.atan2(relative[1, 0], relative[0, 0]))}
            world_frames.append(data.qpos.copy())
        # Common whole-arm camera framing across both endpoints and all candidates.
        options = mujoco.MjvOption()
        options.geomgroup[3] = 0
        with mujoco.Renderer(model, height=440, width=600) as renderer:
            for pose_i, label in enumerate(("baseline", "changed")):
                model.body("base").pos[:] = root_pos
                model.body("base").quat[:] = root_quat
                data.qpos[:] = world_frames[pose_i]
                mujoco.mj_forward(model, data)
                for view_i, azimuth in enumerate((0, 90)):
                    camera = mujoco.MjvCamera()
                    mujoco.mjv_defaultCamera(camera)
                    camera.lookat[:] = [0, 0, 0.30]
                    camera.distance, camera.elevation, camera.azimuth = 0.78, -12, azimuth
                    renderer.update_scene(data, camera=camera, scene_option=options)
                    im = Image.fromarray(renderer.render())
                    draw = ImageDraw.Draw(im)
                    draw.rectangle((0, 0, 600, 55), fill="#15191c")
                    draw.text((8, 5), f"{candidate} | {label} | az {azimuth}", font=font)
                    draw.text((8, 29), "UNVERIFIED static FK; shoulder limit conflict", font=small)
                    name = f"{candidate}-{label}-world-{azimuth}.png"
                    im.save(out / name)
                    world_sheet.paste(im, ((pose_i * 2 + view_i) * 600, 80 + index * 440))
                # Rigidly place the forearm at identity, keeping the recorded qpos intact.
                forearm = transform(data, "lower_arm")
                base = transform(data, "base")
                rotation = forearm[:3, :3].T
                root_rotation = rotation @ base[:3, :3]
                quat = np.empty(4)
                mujoco.mju_mat2Quat(quat, root_rotation.ravel())
                model.body("base").quat[:] = quat
                model.body("base").pos[:] = np.array([0, 0, 0.35]) + rotation @ (base[:3, 3] - forearm[:3, 3])
                mujoco.mj_forward(model, data)
                assert np.allclose(data.body("lower_arm").xmat.reshape(3, 3), np.eye(3), atol=1e-10)
                assert np.allclose(data.body("lower_arm").xpos, [0, 0, 0.35], atol=1e-10)
                # Hide upstream links and ground for this diagnostic frame only.
                saved_groups = model.geom_group.copy()
                local_names = {"visual_" + n for n in ("lower_arm", "wrist", "gripper", "moving_jaw_so101_v1")}
                for gid in range(model.ngeom):
                    if mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_GEOM, gid) not in local_names:
                        model.geom_group[gid] = 4
                options.geomgroup[4] = 0
                camera = mujoco.MjvCamera()
                mujoco.mjv_defaultCamera(camera)
                camera.lookat[:] = [-0.11, 0, 0.35]
                camera.distance, camera.elevation, camera.azimuth = 0.46, -90, 0
                renderer.update_scene(data, camera=camera, scene_option=options)
                im = Image.fromarray(renderer.render())
                draw = ImageDraw.Draw(im)
                draw.rectangle((0, 0, 600, 65), fill="#15191c")
                heading = states[label]["forearm_wrist_z_heading_deg"]
                draw.text((8, 5), f"{candidate} | {label} | FOREARM FRAME", font=font)
                draw.text((8, 29), f"Wrist frame Z heading {heading:+.3f} deg; not photo-fitted", font=small)
                draw.text((8, 47), "Blue forearm | purple wrist | green gripper | yellow jaw", font=small)
                im.save(out / f"{candidate}-{label}-forearm.png")
                local_sheet.paste(im, (pose_i * 600, 80 + index * 440))
                model.geom_group[:] = saved_groups
                options.geomgroup[4] = 1
        a, b = states["baseline"], states["changed"]
        relative_delta = np.array(b["forearm_T_wrist"])[:3, :3] @ np.array(a["forearm_T_wrist"])[:3, :3].T
        local_change = math.degrees(math.atan2(relative_delta[1, 0], relative_delta[0, 0]))
        assert math.isclose(local_change, sign * deltas["wrist_flex"], abs_tol=1e-9)
        results.append({"id": candidate, "wrist_mapping": {"sign": sign, "offset_deg": offset},
                        "all_other_arm_mappings": "positive sign, zero offset, degrees to radians; unverified",
                        "jaw_display_policy": "Unverified affine normalized 0â€“100 to model min/max, for display only",
                        "states": states, "wrist_relative_forearm_delta_deg": local_change,
                        "world_gripper_rotation_magnitude_deg": angle_between(
                            np.array(a["world_T_gripper"])[:3, :3], np.array(b["world_T_gripper"])[:3, :3]),
                        "adopted_for_hardware": False, "verified": False})
    for sheet, title, name in (
        (world_sheet, "Both endpoints | common cameras | all observed joint changes | UNVERIFIED", "whole-arm-candidates.jpg"),
        (local_sheet, "Forearm fixed at identity | same top view | wrist sign and offset hypotheses", "forearm-candidates.jpg")):
        draw = ImageDraw.Draw(sheet)
        draw.text((12, 12), title, font=font)
        draw.text((12, 40), "Each row uses ONE mapping for both endpoints. No clipping, fitting or dynamics steps.", font=small)
        sheet.save(out / name, quality=94)
    photos = Image.new("RGB", (1600, 1040), "#15191c")
    draw = ImageDraw.Draw(photos)
    draw.text((12, 8), "Operator-paired stationary photos | differing viewpoints; no image-motion sign inference", font=font)
    for i, name in enumerate(("baseline-front", "baseline-side", "changed-front", "changed-side")):
        with Image.open(SOURCE / "photos" / (name + ".png")) as original:
            thumb = ImageOps.contain(original.convert("RGB"), (780, 450))
        x, y = (i % 2) * 800, (i // 2) * 500 + 40
        draw.text((x + 12, y), name, font=font)
        photos.paste(thumb, (x + (800 - thumb.width) // 2, y + 30))
    photos.save(out / "paired-photos.jpg", quality=94)
    report = {"scope": "Offline candidate FK at stationary endpoints; not trajectory, fitted calibration or hardware execution",
              "evidence_commit": "cea2e95b2b6c028162c2e4e983e75150bf3c2982",
              "bundle_sha256": digest(BUNDLE), "scene_sha256": digest(scene),
              "mujoco_version": mujoco.__version__, "capture_audits": audits,
              "observed_values": values, "changed_minus_paired_baseline": deltas,
              "units": {n: "normalized_0_100" if n == "gripper" else "degrees" for n in NAMES},
              "pairing": pairing, "new_photo_mirroring": "unknown", "new_photo_camera_identity": "unknown",
              "candidates": results, "offset_candidates_rationale": "0 and illustrative +/-90-degree convention sensitivity; not fitted, exhaustive or adopted",
              "gripper_display_delta_deg": math.degrees(results[0]["states"]["changed"]["qpos_rad"]["gripper"] - results[0]["states"]["baseline"]["qpos_rad"]["gripper"]),
              "jaw_policy_affects_forearm_T_wrist": False,
              "views": {"world": "Common lookat [0,0,0.30], distance .78, elevation -12, azimuth 0/90",
                        "local": "Rigid root transformation fixes lower_arm at [0,0,.35], identity orientation; upstream links hidden; same camera, elevation -90",
                        "fitted_to_photos": False},
              "limits_modified": False, "values_clipped": False, "dynamics_steps": 0,
              "hardware_mapping_verified": False, "gripper_conversion_verified": False}
    (out / "report.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"deltas": deltas, "candidates": [{k: r[k] for k in
          ("id", "wrist_relative_forearm_delta_deg", "world_gripper_rotation_magnitude_deg")} for r in results]}, indent=2))


if __name__ == "__main__":
    main()
