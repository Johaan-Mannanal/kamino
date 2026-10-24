"""Reusable smoke validation of bundles produced by photo2sim.simulation.export."""

import json
import shutil
import tempfile
import time
import warnings
from pathlib import Path
from xml.etree import ElementTree as ET

import mujoco
import numpy as np

from photo2sim.contracts import AssetRecord
from photo2sim.simulation.export import (
    _check_prepared_mesh,
    _dimensions,
    _inertia,
    _local_file,
    _require,
)

# Fixed smoke-test thresholds, separate from contact parameters and physical claims.
THRESHOLDS = {
    "maximum_penetration_m": 0.001,
    "final_bottom_error_m": 0.0002,
    "settling_window_s": 0.5,
    "maximum_settled_linear_speed_m_s": 0.001,
    "maximum_settled_angular_speed_rad_s": 0.01,
}


def _one_scene(scene, duration_s):
    started = time.perf_counter()
    result = {
        "passed": False,
        "thresholds": dict(THRESHOLDS),
        "requested_simulated_duration_s": duration_s,
    }
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            root = scene.parent.resolve()
            asset = AssetRecord.model_validate_json(
                (root / "asset.json").read_text(encoding="utf-8")
            )
            assumptions = json.loads((root / "simulation.json").read_text(encoding="utf-8"))
            _require(asset.collision.kind == "box", "Validator supports box exports only")
            _check_prepared_mesh(asset, root)
            xml = ET.parse(scene).getroot()
            compiler = xml.find("compiler")
            if compiler is not None:
                _require(
                    not any(compiler.get(name) for name in ("meshdir", "assetdir", "texturedir")),
                    "Exporter bundles must not redirect asset directories",
                )
            _require(
                not xml.findall(".//include"),
                "Includes are not supported in a self-contained export",
            )
            for element in xml.iter():
                if "file" in element.attrib:
                    _local_file(root, element.attrib["file"])
            model = mujoco.MjModel.from_xml_path(str(scene.resolve()))
            data = mujoco.MjData(model)
            mujoco.mj_forward(model, data)
            _require(model.nq == 7 and model.nv == 6, "Expected one free rigid body")
            body = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, "asset")
            visual = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "visual")
            collision = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "collision")
            ground = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "ground")
            _require(
                body > 0 and min(visual, collision, ground) >= 0,
                "Required exported elements missing",
            )
            sides = _dimensions(asset)
            _require(
                np.isclose(model.body_mass[body], asset.properties.mass_kg.value),
                "Exported mass mismatch",
            )
            _require(
                np.allclose(model.body_inertia[body], _inertia(asset), rtol=1e-6, atol=1e-15),
                "Exported inertia mismatch",
            )
            _require(np.all(model.body_inertia[body] > 0), "Inertia must be positive")
            _require(
                np.allclose(model.geom_size[collision], sides / 2, rtol=1e-5, atol=1e-9),
                "Collision half extents mismatch",
            )
            _require(
                model.geom_type[collision] == mujoco.mjtGeom.mjGEOM_BOX, "Collision must be a box"
            )
            _require(
                model.geom_contype[visual] == model.geom_conaffinity[visual] == 0,
                "Visual mesh must not collide",
            )
            _require(model.geom_contype[collision] != 0, "Collision proxy is disabled")
            mesh_id = model.geom_dataid[visual]
            _require(
                model.geom_type[visual] == mujoco.mjtGeom.mjGEOM_MESH and mesh_id >= 0,
                "Missing visual mesh",
            )
            start, count = model.mesh_vertadr[mesh_id], model.mesh_vertnum[mesh_id]
            vertices = (
                model.mesh_vert[start : start + count] @ data.geom_xmat[visual].reshape(3, 3).T
                + data.geom_xpos[visual]
            )
            rendered_extents = np.ptp(vertices, axis=0)
            _require(
                np.allclose(rendered_extents, sides, rtol=1e-4, atol=1e-8),
                "Rendered mesh scale mismatch",
            )
            _require(
                np.allclose(model.opt.gravity, assumptions["gravity_m_s2"]),
                "Gravity disagrees with assumptions",
            )
            _require(
                np.isclose(model.opt.timestep, assumptions["timestep_s"], rtol=1e-9),
                "Timestep disagrees with assumptions",
            )
            _require(
                np.allclose(model.geom_friction[collision], assumptions["friction"]),
                "Friction disagrees with assumptions",
            )
            initial_z = float(data.xpos[body, 2])
            initial_bottom = initial_z - sides[2] / 2
            _require(
                np.isclose(initial_bottom, assumptions["initial_bottom_height_m"]),
                "Initial drop height mismatch",
            )
            _require(initial_bottom > 0, "Expected positive initial ground clearance")
            steps = int(np.ceil(duration_s / model.opt.timestep))
            _require(
                0 < steps <= 2_000_000, "Requested validation exceeds the two-million-step budget"
            )
            penetration = tail_linear = tail_angular = 0.0
            first_contact = None
            final_contacts = 0
            min_z = initial_z
            loop_started = time.perf_counter()
            for _ in range(steps):
                mujoco.mj_step(model, data)
                mujoco.mj_forward(model, data)
                _require(
                    np.isfinite(data.qpos).all() and np.isfinite(data.qvel).all(),
                    "Nonfinite simulation state",
                )
                min_z = min(min_z, float(data.xpos[body, 2]))
                contacts = [
                    c for c in data.contact if {int(c.geom1), int(c.geom2)} == {collision, ground}
                ]
                final_contacts = len(contacts)
                for contact in contacts:
                    if first_contact is None:
                        first_contact = float(data.time)
                    penetration = max(penetration, -float(contact.dist))
                if data.time >= duration_s - THRESHOLDS["settling_window_s"]:
                    tail_linear = max(tail_linear, float(np.linalg.norm(data.qvel[:3])))
                    tail_angular = max(tail_angular, float(np.linalg.norm(data.qvel[3:])))
            loop_wall = time.perf_counter() - loop_started
            final_bottom = float(data.xpos[body, 2]) - sides[2] / 2
            warning_counts = {
                mujoco.mjtWarning(i).name: int(w.number)
                for i, w in enumerate(data.warning)
                if w.number
            }
            checks = {
                "fell": initial_z - min_z >= initial_bottom / 2,
                "ground_contact": first_contact is not None and final_contacts > 0,
                "penetration": penetration <= THRESHOLDS["maximum_penetration_m"],
                "resting_height": abs(final_bottom) <= THRESHOLDS["final_bottom_error_m"],
                "settled_linear": tail_linear <= THRESHOLDS["maximum_settled_linear_speed_m_s"],
                "settled_angular": tail_angular
                <= THRESHOLDS["maximum_settled_angular_speed_rad_s"],
                "no_warnings": not warning_counts and not caught,
            }
            checks = {name: bool(value) for name, value in checks.items()}
            result.update(
                passed=all(checks.values()),
                checks=checks,
                timestep_s=float(model.opt.timestep),
                steps=steps,
                simulated_duration_s=float(data.time),
                simulation_wall_clock_s=loop_wall,
                initial_bottom_height_m=float(initial_bottom),
                final_bottom_height_m=float(final_bottom),
                first_ground_contact_s=first_contact,
                final_ground_contacts=final_contacts,
                maximum_penetration_m=penetration,
                maximum_settled_linear_speed_m_s=tail_linear,
                maximum_settled_angular_speed_rad_s=tail_angular,
                rendered_dimensions_m=rendered_extents.tolist(),
                mujoco_warning_counts=warning_counts,
                python_warnings=[str(w.message) for w in caught],
                asset_id=str(asset.asset_id),
                synthetic=asset.synthetic,
            )
    except Exception as error:
        result["error"] = f"{type(error).__name__}: {error}"
    result["total_wall_clock_s"] = time.perf_counter() - started
    return result


def validate_export(
    scene: Path, *, duration_s: float = 3.0, check_portability: bool = True
) -> dict:
    """Return actual numeric results; does not imply real-world fidelity or viewer inspection."""
    if not np.isfinite(duration_s) or duration_s <= THRESHOLDS["settling_window_s"]:
        raise ValueError("Duration must be finite and longer than the settling window")
    started = time.perf_counter()
    scene = Path(scene).resolve()
    report = {
        "scope": "Upright box-proxy smoke test only, not real-world physical accuracy",
        "viewer_inspected": False,
        "environment": {"mujoco": mujoco.__version__, "numpy": np.__version__},
        "original": _one_scene(scene, duration_s),
    }
    if check_portability:
        try:
            with tempfile.TemporaryDirectory(prefix="photo2sim-export-validation-") as temporary:
                copied = Path(temporary) / "relocated"
                shutil.copytree(scene.parent, copied)
                report["relocated"] = _one_scene(copied / scene.name, duration_s)
            report["portability_passed"] = report["relocated"]["passed"]
        except Exception as error:
            report.update(
                portability_passed=False, relocation_error=f"{type(error).__name__}: {error}"
            )
    report["passed"] = report["original"]["passed"] and (
        not check_portability or report["portability_passed"]
    )
    report["total_wall_clock_s"] = time.perf_counter() - started
    return report


def main():
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scene", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--duration-s", type=float, default=3.0)
    args = parser.parse_args()
    report = validate_export(args.scene, duration_s=args.duration_s)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
