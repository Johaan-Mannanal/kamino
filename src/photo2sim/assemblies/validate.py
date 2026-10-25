"""Motion/portability smoke checks for generated assemblies; not physical accuracy."""

import json
import shutil
import tempfile
import time
import warnings
from pathlib import Path
from xml.etree import ElementTree as ET

import mujoco
import numpy as np

from photo2sim.assemblies.contracts import AssemblyRecord, joint_limits
from photo2sim.assemblies.inspection import inspect_model
from photo2sim.contracts import bundle_path

TRACKING_TOLERANCE_RAD = 0.03
PHASE_DURATION_S = 2.0


def _require(value, message):
    if not value:
        raise ValueError(message)


def _one(scene):
    result = {"passed": False}
    start = time.perf_counter()
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            root = scene.parent.resolve()
            record = AssemblyRecord.model_validate_json(
                (root / "assembly.json").read_text(encoding="utf-8")
            )
            hinges = [j for j in record.joints if j.kind != "fixed" and j.drive is not None]
            _require(
                hinges, "Motion validation requires at least one independently driven moving joint"
            )
            xml = ET.parse(scene).getroot()
            _require(
                not xml.findall(".//include"), "Self-contained exports cannot include external XML"
            )
            compiler = xml.find("compiler")
            if compiler is not None:
                _require(
                    not any(compiler.get(k) for k in ("meshdir", "assetdir", "texturedir")),
                    "Asset directory redirection is unsupported",
                )
            for element in xml.iter():
                if "file" in element.attrib:
                    path = (root / bundle_path(element.attrib["file"])).resolve(strict=True)
                    _require(
                        path.is_relative_to(root) and path.is_file(), "External asset reference"
                    )
            m = mujoco.MjModel.from_xml_path(str(scene.resolve()))
            assumptions = json.loads((root / "simulation.json").read_text(encoding="utf-8"))
            indices = inspect_model(m, record, root, assumptions, scene)
            d = mujoco.MjData(m)
            steps = round(PHASE_DURATION_S / m.opt.timestep)
            trials = []
            finals = []
            warning_count = 0
            moved = True
            all_moving = [j for j in record.joints if j.kind != "fixed"]
            limit_indices = [(j, int(m.joint(j.name).qposadr[0])) for j in all_moving]
            unit_errors = {"rad": 0.0, "m": 0.0}
            unit_limits = {"rad": 0.0, "m": 0.0}
            for _ in range(2):
                mujoco.mj_resetData(m, d)
                mujoco.mj_forward(m, d)
                phases = []
                for j, qi, ai in indices:
                    actuals = []
                    targets = [joint_limits(j)[1] * 0.5, joint_limits(j)[0] * 0.5, 0.0]
                    for target in targets:
                        d.ctrl[:] = 0
                        d.ctrl[ai] = target
                        for _step in range(steps):
                            mujoco.mj_step(m, d)
                            _require(
                                np.isfinite(d.qpos).all()
                                and np.isfinite(d.qvel).all()
                                and np.isfinite(d.qacc).all(),
                                "Nonfinite simulation state",
                            )
                            warning_count = max(
                                warning_count, sum(int(w.number) for w in d.warning)
                            )
                            for other, oq in limit_indices:
                                lo, hi = joint_limits(other)
                                violation = max(0.0, lo - float(d.qpos[oq]), float(d.qpos[oq]) - hi)
                                unit = "m" if other.kind == "prismatic" else "rad"
                                unit_limits[unit] = max(unit_limits[unit], violation)
                        actual = float(d.qpos[qi])
                        actuals.append(actual)
                        errors = {
                            other.name: abs(float(d.qpos[oq]) - float(d.ctrl[oa]))
                            for other, oq, oa in indices
                        }
                        for other, _oq, _oa in indices:
                            unit = "m" if other.kind == "prismatic" else "rad"
                            unit_errors[unit] = max(unit_errors[unit], errors[other.name])
                        for other in all_moving:
                            if other.coupling:
                                actual_follower = d.qpos[int(m.joint(other.name).qposadr[0])]
                                actual_driver = d.qpos[
                                    int(m.joint(other.coupling.driver_joint).qposadr[0])
                                ]
                                residual = abs(
                                    float(
                                        actual_follower
                                        - other.coupling.offset
                                        - other.coupling.ratio * actual_driver
                                    )
                                )
                                unit = "m" if other.kind == "prismatic" else "rad"
                                unit_errors[unit] = max(unit_errors[unit], residual)
                        phases.append(
                            {
                                "joint": j.name,
                                "unit": "m" if j.kind == "prismatic" else "rad",
                                "target": target,
                                "actual": actual,
                                "tracking_errors": errors,
                                **(
                                    {"target_m": target, "actual_m": actual}
                                    if j.kind == "prismatic"
                                    else {"target_rad": target, "actual_rad": actual}
                                ),
                                "tracking_errors_rad": {
                                    other.name: errors[other.name]
                                    for other, _, _ in indices
                                    if other.kind == "revolute"
                                },
                                "tracking_errors_m": {
                                    other.name: errors[other.name]
                                    for other, _, _ in indices
                                    if other.kind == "prismatic"
                                },
                                "max_all_joint_tracking_error_rad": max(
                                    [
                                        errors[other.name]
                                        for other, _, _ in indices
                                        if other.kind == "revolute"
                                    ],
                                    default=0.0,
                                ),
                                "simulated_time_s": float(d.time),
                            }
                        )
                    moved = moved and (
                        max(actuals) - min(actuals) >= 0.5 * (max(targets) - min(targets))
                    )
                trials.append({"phases": phases, "simulated_duration_s": float(d.time)})
                finals.append(np.concatenate([d.qpos, d.qvel, d.ctrl]).copy())
            repeatable = bool(np.allclose(finals[0], finals[1], rtol=0, atol=1e-10))
            checks = {
                "reviewed_model_consistency": True,
                "actual_joint_motion": bool(moved),
                "tracking": unit_errors["rad"] <= TRACKING_TOLERANCE_RAD
                and unit_errors["m"] <= 0.003,
                "joint_limits": unit_limits["rad"] <= TRACKING_TOLERANCE_RAD
                and unit_limits["m"] <= 0.003,
                "reset_repeatable": repeatable,
                "no_warnings": warning_count == 0 and not caught,
            }
            result.update(
                passed=all(checks.values()),
                checks=checks,
                trials=trials,
                reset_repeatable=repeatable,
                warnings=warning_count,
                python_warnings=[str(w.message) for w in caught],
                max_tracking_error_rad=unit_errors["rad"],
                max_tracking_error_m=unit_errors["m"],
                max_limit_violation_m=unit_limits["m"],
                joint_units={j.name: "m" if j.kind == "prismatic" else "rad" for j in all_moving},
                max_limit_violation_rad=unit_limits["rad"],
                timestep_s=float(m.opt.timestep),
                steps_per_phase=steps,
                synthetic=record.synthetic,
            )
    except Exception as error:
        result["error"] = f"{type(error).__name__}: {error}"
    result["wall_time_s"] = time.perf_counter() - start
    return result


def validate_assembly(scene: Path, *, check_portability: bool = True) -> dict:
    """Exercise each hinge separately, twice from reset, with optional relocation."""
    scene = Path(scene).resolve()
    report = {
        "tracking_tolerance_m": 0.003,
        "scope": "Fixed-root assembly motion smoke check; not calibrated dynamics or reconstruction accuracy",
        "viewer_inspected": False,
        "environment": {"mujoco": mujoco.__version__, "numpy": np.__version__},
        "tracking_tolerance_rad": TRACKING_TOLERANCE_RAD,
        "phase_duration_s": PHASE_DURATION_S,
        "original": _one(scene),
    }
    if "error" in report["original"]:
        report["error"] = report["original"]["error"]
    if check_portability and report["original"]["passed"]:
        try:
            with tempfile.TemporaryDirectory(prefix="photo2sim-assembly-check-") as temporary:
                copied = Path(temporary) / "relocated"
                shutil.copytree(scene.parent, copied)
                report["relocated"] = _one(copied / scene.name)
        except Exception as error:
            report["relocated"] = {"passed": False, "error": f"{type(error).__name__}: {error}"}
    report["passed"] = report["original"]["passed"] and (
        not check_portability or report.get("relocated", {}).get("passed", False)
    )
    return report
