"""Portable, simulation-only SO101 workspace composition and reset checks."""

import argparse
import hashlib
import json
import math
import shutil
import tempfile
import time
import warnings
from pathlib import Path
from xml.etree import ElementTree as ET

import mujoco
import numpy as np
from pydantic import BaseModel, ConfigDict, Field, field_validator

from photo2sim.contracts import AssetRecord
from photo2sim.simulation.export import _dimensions, _inertia, _local_file, _numbers, export_asset
from photo2sim.simulation.so101 import JOINT_NAMES, joint_mapping
from photo2sim.simulation.validate import THRESHOLDS

ROBOT_COMMIT = "f3b6013629c7b94f8ee93fd977b161fa8350f9bc"
RESET_KEY = "workspace_reset"


class WorkspaceLayout(BaseModel):
    """An assumed layout in the robot mount frame, with tabletop at Z=0."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, strict=True)
    table_center_xy_m: list[float] = Field(
        default_factory=lambda: [0.25, 0.0], min_length=2, max_length=2
    )
    table_size_xy_m: list[float] = Field(
        default_factory=lambda: [1.0, 0.8], min_length=2, max_length=2
    )
    table_thickness_m: float = Field(default=0.05, gt=0)
    object_xy_m: list[float] = Field(
        default_factory=lambda: [0.30, 0.10], min_length=2, max_length=2
    )
    drop_height_m: float = Field(default=0.02, gt=0, le=0.1)
    robot_qpos_rad: dict[str, float] = Field(
        default_factory=lambda: dict.fromkeys(JOINT_NAMES, 0.0)
    )

    @field_validator("table_size_xy_m")
    @classmethod
    def positive_sizes(cls, values):
        if any(value <= 0 for value in values):
            raise ValueError("Table sizes must be positive")
        return values

    @field_validator("robot_qpos_rad")
    @classmethod
    def complete_pose(cls, values):
        if set(values) != set(JOINT_NAMES):
            raise ValueError("Specify exactly the six named robot joints in radians")
        return values


def _copy_robot(robot_dir: Path, destination: Path) -> dict:
    manifest = json.loads((robot_dir / "SOURCE.json").read_text())
    if manifest["commit"] != ROBOT_COMMIT:
        raise ValueError("Workspace composer requires the pinned SO101 model")
    destination.mkdir()
    for name, expected in manifest["files"].items():
        source = _local_file(robot_dir, name)
        content = source.read_bytes()
        if (
            len(content) != expected["bytes"]
            or hashlib.sha256(content).hexdigest() != expected["sha256"]
        ):
            raise ValueError(f"Pinned robot source hash mismatch: {name}")
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    shutil.copyfile(robot_dir / "SOURCE.json", destination / "SOURCE.json")
    return manifest


def reset_workspace(model: mujoco.MjModel, data: mujoco.MjData) -> None:
    """Reset simulation state and controls only; has no hardware dependencies."""
    key = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_KEY, RESET_KEY)
    if key < 0:
        raise ValueError("Missing workspace reset keyframe")
    mujoco.mj_resetDataKeyframe(model, data, key)
    mujoco.mj_forward(model, data)


def build_workspace(
    robot_dir: Path, asset_dir: Path, output_dir: Path, layout: WorkspaceLayout
) -> Path:
    """Compose a new portable scene from a pinned robot and prepared box asset."""
    layout = WorkspaceLayout.model_validate(layout.model_dump())
    robot_dir, asset_dir, output = Path(robot_dir), Path(asset_dir), Path(output_dir).absolute()
    if output.exists() or output.is_symlink():
        raise FileExistsError("Choose a new workspace directory; existing outputs are preserved")
    asset = AssetRecord.model_validate_json((asset_dir / "asset.json").read_text())
    dims = asset.properties.dimensions_m
    sides = np.array([dims.x, dims.y, dims.z])
    if np.any(
        np.abs(np.array(layout.object_xy_m) - layout.table_center_xy_m) + sides[:2] / 2
        >= np.array(layout.table_size_xy_m) / 2
    ):
        raise ValueError("Object bounding box must fit strictly inside the tabletop")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".so101-workspace-", dir=output.parent) as temporary:
        stage = Path(temporary) / "bundle"
        stage.mkdir()
        manifest = _copy_robot(robot_dir, stage / "robot")
        object_scene = export_asset(asset, asset_dir, stage / "object")
        assumptions = json.loads((stage / "object/simulation.json").read_text())
        root = ET.parse(stage / "robot/so101.xml").getroot()
        root.set("model", "kamino_so101_workspace")
        root.find("compiler").set("meshdir", ".")
        root.find("option").set("timestep", str(assumptions["timestep_s"]))
        for mesh in root.findall("./asset/mesh"):
            mesh.set("file", "robot/assets/" + mesh.attrib["file"])
        object_xml = ET.parse(object_scene).getroot()
        mesh = object_xml.find("./asset/mesh")
        mesh.set("file", "object/" + asset.visual_mesh)
        root.find("asset").append(mesh)
        body = object_xml.find("./worldbody/body")
        body.set("pos", _numbers([*layout.object_xy_m, sides[2] / 2 + layout.drop_height_m]))
        collision = body.find("geom[@name='collision']")
        collision.set("friction", _numbers(assumptions["friction"]))
        collision.set("solref", _numbers(assumptions["contact_solref"]))
        world = root.find("worldbody")
        world.append(body)
        ET.SubElement(
            world,
            "geom",
            name="workspace_table",
            type="box",
            pos=_numbers([*layout.table_center_xy_m, -layout.table_thickness_m / 2]),
            size=_numbers([*(np.array(layout.table_size_xy_m) / 2), layout.table_thickness_m / 2]),
            friction=_numbers(assumptions["friction"]),
            solref=_numbers(assumptions["contact_solref"]),
            rgba="0.28 0.30 0.34 1",
        )
        ET.SubElement(world, "light", pos="0.2 -0.5 1.5", dir="0 0 -1")
        ET.SubElement(root, "statistic", center="0.20 0 0.12", extent="0.65")
        scene = stage / "scene.xml"
        ET.indent(root)
        ET.ElementTree(root).write(scene, encoding="utf-8", xml_declaration=True)
        model = mujoco.MjModel.from_xml_path(str(scene))
        data = mujoco.MjData(model)
        for row in joint_mapping(model):
            value = layout.robot_qpos_rad[row["joint_name"]]
            for limits in (row["joint_range_rad"], row["control_range_rad"]):
                if not limits[0] <= value <= limits[1]:
                    raise ValueError(f"Reset pose exceeds model limit: {row['joint_name']}")
            data.qpos[row["qpos_address"]] = value
            data.ctrl[row["actuator_id"]] = value
        mujoco.mj_forward(model, data)
        object_geom = model.geom("collision").id
        table_geom = model.geom("workspace_table").id
        if any(
            object_geom in (c.geom1, c.geom2)
            and table_geom not in (c.geom1, c.geom2)
            and c.dist < 0
            for c in data.contact
        ):
            raise ValueError("Initial object overlaps the robot; change the layout")
        keys = ET.SubElement(root, "keyframe")
        ET.SubElement(
            keys, "key", name=RESET_KEY, qpos=_numbers(data.qpos), ctrl=_numbers(data.ctrl)
        )
        ET.indent(root)
        ET.ElementTree(root).write(scene, encoding="utf-8", xml_declaration=True)
        metadata = {
            "format": "photo2sim-so101-workspace/1",
            "layout": layout.model_dump(),
            "layout_provenance": "assumed_not_measured",
            "frame": "robot base mount origin; +Z up; tabletop Z=0; no measured world transform",
            "robot_source_commit": manifest["commit"],
            "object_asset_id": str(asset.asset_id),
            "object_asset_sha256": hashlib.sha256(
                (stage / "object/asset.json").read_bytes()
            ).hexdigest(),
            "timestep_s": assumptions["timestep_s"],
            "robot_original_timestep_s": 0.005,
            "robot_dynamics": "Upstream approximate servo gains/forces unchanged; not hardware-calibrated",
            "object_contact": assumptions,
            "hardware_mapping_verified": False,
            "manipulation_tested": False,
        }
        (stage / "workspace.json").write_text(json.dumps(metadata, indent=2) + "\n")
        # Verify keyframe and relative resources before publishing the new folder.
        model = mujoco.MjModel.from_xml_path(str(scene))
        reset_workspace(model, mujoco.MjData(model))
        if output.exists() or output.is_symlink():
            raise FileExistsError("Output appeared during composition; nothing was overwritten")
        stage.rename(output)
    return output / "scene.xml"


def validate_workspace(scene: Path, *, duration_s: float = 3.0) -> dict:
    """Repeat a hold/drop twice, testing contact and reset determinism, not a task."""
    started = time.perf_counter()
    if not math.isfinite(duration_s) or duration_s <= THRESHOLDS["settling_window_s"]:
        raise ValueError("Duration must exceed the settling window and be finite")
    scene = Path(scene)
    metadata = json.loads((scene.parent / "workspace.json").read_text())
    layout = WorkspaceLayout.model_validate(metadata["layout"])
    asset = AssetRecord.model_validate_json((scene.parent / "object/asset.json").read_text())
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        model = mujoco.MjModel.from_xml_path(str(scene))
        rows = joint_mapping(model)
        data = mujoco.MjData(model)
        steps = math.ceil(duration_s / model.opt.timestep)
        if not 0 < steps <= 2_000_000:
            raise ValueError("Workspace validation exceeds the step budget")
        object_geom = model.geom("collision").id
        table_geom = model.geom("workspace_table").id
        body = model.body("asset").id
        free_jid = model.joint("asset_free").id
        dof = int(model.jnt_dofadr[free_jid])
        half_height = asset.properties.dimensions_m.z / 2
        reset_workspace(model, data)
        contact = metadata["object_contact"]
        configuration_checks = {
            "degrees_of_freedom": (model.nq, model.nv, model.nu) == (13, 12, 6),
            "mass": np.isclose(model.body_mass[body], asset.properties.mass_kg.value),
            "inertia": np.allclose(model.body_inertia[body], _inertia(asset), atol=1e-12),
            "box_dimensions": np.allclose(model.geom_size[object_geom], _dimensions(asset) / 2),
            "collision_enabled": model.geom_contype[object_geom] != 0,
            "timestep": np.isclose(model.opt.timestep, metadata["timestep_s"], atol=1e-12),
            "gravity": np.allclose(model.opt.gravity, contact["gravity_m_s2"]),
            "friction": np.allclose(model.geom_friction[object_geom], contact["friction"]),
            "contact_settings": np.allclose(
                model.geom_solref[object_geom], contact["contact_solref"]
            ),
            "table_position": np.allclose(
                data.geom_xpos[table_geom],
                [*layout.table_center_xy_m, -layout.table_thickness_m / 2],
            ),
            "table_size": np.allclose(
                model.geom_size[table_geom],
                [*(np.array(layout.table_size_xy_m) / 2), layout.table_thickness_m / 2],
            ),
            "initial_object_position": np.allclose(
                data.xpos[body], [*layout.object_xy_m, half_height + layout.drop_height_m]
            ),
            "reset_targets": all(
                np.isclose(data.qpos[r["qpos_address"]], layout.robot_qpos_rad[r["joint_name"]])
                and np.isclose(data.ctrl[r["actuator_id"]], layout.robot_qpos_rad[r["joint_name"]])
                for r in rows
            ),
            "asset_record": hashlib.sha256(
                (scene.parent / "object/asset.json").read_bytes()
            ).hexdigest()
            == metadata["object_asset_sha256"],
        }
        configuration_checks = {key: bool(value) for key, value in configuration_checks.items()}
        configuration_matches = all(configuration_checks.values())
        runs, final_states = [], []
        for _ in range(2):
            reset_workspace(model, data)
            peak = deviation = linear = angular = 0.0
            table_contact = False
            robot_contacts = 0
            finite = True
            for _ in range(steps):
                mujoco.mj_step(model, data)
                finite = finite and bool(
                    np.isfinite(data.qpos).all()
                    and np.isfinite(data.qvel).all()
                    and np.isfinite(data.qacc).all()
                )
                for c in data.contact:
                    pair = {int(c.geom1), int(c.geom2)}
                    if pair == {object_geom, table_geom}:
                        table_contact = True
                        peak = max(peak, -float(c.dist))
                    elif object_geom in pair:
                        robot_contacts += 1
                deviation = max(
                    deviation,
                    *(
                        abs(
                            float(data.qpos[r["qpos_address"]])
                            - layout.robot_qpos_rad[r["joint_name"]]
                        )
                        for r in rows
                    ),
                )
                if data.time >= duration_s - THRESHOLDS["settling_window_s"]:
                    linear = max(linear, float(np.linalg.norm(data.qvel[dof : dof + 3])))
                    angular = max(angular, float(np.linalg.norm(data.qvel[dof + 3 : dof + 6])))
            mujoco.mj_forward(model, data)
            warning_count = int(sum(w.number for w in data.warning))
            bottom_error = float(data.xpos[body, 2]) - half_height
            passed = (
                finite
                and not warning_count
                and table_contact
                and not robot_contacts
                and peak <= THRESHOLDS["maximum_penetration_m"]
                and abs(bottom_error) <= THRESHOLDS["final_bottom_error_m"]
                and linear <= THRESHOLDS["maximum_settled_linear_speed_m_s"]
                and angular <= THRESHOLDS["maximum_settled_angular_speed_rad_s"]
                and deviation <= 0.02
            )
            runs.append(
                {
                    "passed": passed,
                    "steps": steps,
                    "simulated_duration_s": float(data.time),
                    "finite_state": finite,
                    "warning_count": warning_count,
                    "table_contact": table_contact,
                    "object_robot_contact_count": robot_contacts,
                    "maximum_penetration_m": peak,
                    "final_bottom_error_m": bottom_error,
                    "maximum_hold_deviation_rad": deviation,
                    "maximum_settled_linear_speed_m_s": linear,
                    "maximum_settled_angular_speed_rad_s": angular,
                    "final_object_position_m": data.xpos[body].tolist(),
                }
            )
            final_states.append(np.concatenate([data.qpos, data.qvel, data.ctrl]).copy())
    repeatable = bool(np.array_equal(final_states[0], final_states[1]))
    return {
        "passed": configuration_matches
        and all(r["passed"] for r in runs)
        and repeatable
        and not caught,
        "configuration_matches": configuration_matches,
        "configuration_checks": configuration_checks,
        "scope": "Offline robot hold and object drop/reset only; no manipulation or physical validation",
        "portability_checked": False,
        "portability_note": "This report checks one directory; validate a relocated copy separately",
        "environment": {"mujoco": mujoco.__version__, "numpy": np.__version__},
        "timestep_s": float(model.opt.timestep),
        "total_wall_clock_s": time.perf_counter() - started,
        "thresholds": {**THRESHOLDS, "maximum_hold_deviation_rad": 0.02},
        "hardware_mapping_verified": False,
        "manipulation_tested": False,
        "reset_reproducible": repeatable,
        "runs": runs,
        "python_warnings": [str(w.message) for w in caught],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build")
    build.add_argument("--robot-dir", type=Path, default=Path("third_party/robotstudio_so101"))
    build.add_argument("--asset-dir", type=Path, required=True)
    build.add_argument("--output-dir", type=Path, required=True)
    build.add_argument("--layout", type=Path)
    check = sub.add_parser("validate")
    check.add_argument("scene", type=Path)
    check.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "build":
        layout = (
            WorkspaceLayout.model_validate_json(args.layout.read_text())
            if args.layout
            else WorkspaceLayout()
        )
        print(build_workspace(args.robot_dir, args.asset_dir, args.output_dir, layout))
    else:
        report = validate_workspace(args.scene)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        with args.report.open("x") as stream:
            json.dump(report, stream, indent=2, allow_nan=False)
            stream.write("\n")
        print(json.dumps(report, indent=2, allow_nan=False))
        if not report["passed"]:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
