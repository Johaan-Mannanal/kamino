"""Deterministic checks for the synthetic box fixture, not a general asset validator."""

import argparse
import json
import platform
import shutil
import tempfile
import warnings
from pathlib import Path
from xml.etree import ElementTree as ET

import mujoco
import numpy as np
import trimesh


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_scene(folder, filename, metadata):
    xml = ET.parse(folder / filename).getroot()
    compiler = xml.find("compiler")
    meshdir = compiler.get("meshdir", "")
    for asset in xml.findall("asset/mesh"):
        relative = Path(meshdir) / asset.get("file")
        require(not relative.is_absolute(), "Absolute mesh path")
        require(
            (folder / relative).resolve().is_relative_to(folder.resolve()), "Escaping mesh path"
        )
        require((folder / relative).is_file(), "Missing mesh file")
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        model = mujoco.MjModel.from_xml_path(str((folder / filename).resolve()))
        data = mujoco.MjData(model)
        mujoco.mj_forward(model, data)
        body = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, "object")
        proxy = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "object_collision")
        table = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "table")
        require(body > 0 and proxy >= 0 and table >= 0, "Missing required fixture names")
        expected_inertia = np.array(metadata["diagonal_inertia_kg_m2"])
        require(np.all(model.body_inertia[body] > 0), "Nonpositive inertia")
        require(np.allclose(model.body_inertia[body], expected_inertia), "Inertia mismatch")
        require(np.isclose(model.body_mass[body], metadata["mass_kg"]), "Mass mismatch")
        require(
            np.allclose(model.geom_size[proxy], metadata["collision"]["half_extents_m"]),
            "Collision scale mismatch",
        )
        require(
            np.all(np.sort(expected_inertia)[:2].sum() >= expected_inertia),
            "Invalid inertia triangle",
        )
        if filename == "scene.xml":
            visual = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "object_visual")
            require(visual >= 0 and model.nmesh == 1, "Visual mesh missing")
            require(
                model.geom_contype[visual] == model.geom_conaffinity[visual] == 0,
                "Visual mesh collides",
            )
            require(
                model.geom_type[proxy] == mujoco.mjtGeom.mjGEOM_BOX, "Proxy is not a separate box"
            )
        settings = metadata["validation"]
        steps = round(settings["duration_s"] / model.opt.timestep)
        initial_z = float(data.xpos[body, 2])
        min_z = initial_z
        first_contact = None
        min_contact_distance = 0.0
        tail_speed = 0.0
        max_contacts = 0
        for _ in range(steps):
            mujoco.mj_step(model, data)
            # Refresh kinematics and contacts for the newly integrated qpos.
            mujoco.mj_forward(model, data)
            require(
                np.isfinite(data.qpos).all() and np.isfinite(data.qvel).all(), "Nonfinite state"
            )
            min_z = min(min_z, float(data.xpos[body, 2]))
            object_contacts = [
                c for c in data.contact if {int(c.geom1), int(c.geom2)} == {proxy, table}
            ]
            max_contacts = max(max_contacts, len(object_contacts))
            for contact in object_contacts:
                if first_contact is None:
                    first_contact = float(data.time)
                min_contact_distance = min(min_contact_distance, float(contact.dist))
            if data.time >= settings["duration_s"] - settings["settling_window_s"]:
                tail_speed = max(tail_speed, float(np.linalg.norm(data.qvel)))
        final_z = float(data.xpos[body, 2])
        expected_z = metadata["table_top_m"] + metadata["dimensions_m"][2] / 2
        warning_counts = {
            mujoco.mjtWarning(i).name: int(w.number) for i, w in enumerate(data.warning) if w.number
        }
        require(first_contact is not None, "No object/table contact")
        require(initial_z - min_z > 0.1, "Object did not fall")
        require(
            abs(final_z - expected_z) <= settings["final_height_tolerance_m"],
            "Unexpected final height",
        )
        require(-min_contact_distance <= settings["max_penetration_m"], "Excessive penetration")
        require(tail_speed <= settings["max_settled_speed"], "Object did not settle")
        require(not warning_counts and not caught, "Simulation or Python warnings")
    return {
        "scene": filename,
        "passed": True,
        "steps": steps,
        "simulated_seconds": float(data.time),
        "initial_centre_z_m": initial_z,
        "final_centre_z_m": final_z,
        "expected_final_centre_z_m": expected_z,
        "first_contact_s": first_contact,
        "max_object_table_contacts": max_contacts,
        "maximum_contact_penetration_m": -min_contact_distance,
        "maximum_settling_window_generalized_speed": tail_speed,
        "mujoco_warning_counts": warning_counts,
        "python_warnings": [str(w.message) for w in caught],
    }


def validate_bundle(folder):
    metadata = json.loads((folder / "metadata.json").read_text(encoding="utf-8"))
    sides = np.array(metadata["dimensions_m"], dtype=float)
    mass = float(metadata["mass_kg"])
    require(np.isfinite(sides).all() and np.all(sides > 0), "Invalid dimensions")
    require(np.isfinite(mass) and mass > 0, "Invalid mass")
    analytic_inertia = mass * (np.sum(sides**2) - sides**2) / 12
    require(
        np.allclose(metadata["diagonal_inertia_kg_m2"], analytic_inertia, rtol=1e-9, atol=1e-12),
        "Inertia is inconsistent with the uniform synthetic box",
    )
    mesh = trimesh.load_mesh(folder / metadata["visual_mesh"], process=False)
    require(isinstance(mesh, trimesh.Trimesh), "Expected triangle mesh")
    require(mesh.is_watertight and mesh.is_winding_consistent, "Invalid closed mesh")
    require(
        np.allclose(mesh.extents * metadata["mesh_scale_to_m"], metadata["dimensions_m"]),
        "Mesh unit/scale mismatch",
    )
    # Convexity without optional scipy: every vertex must lie behind every outward face plane.
    offsets = mesh.vertices[None, :, :] - mesh.triangles[:, :1, :]
    convex = bool(np.all(np.einsum("fvi,fi->fv", offsets, mesh.face_normals) <= 1e-8))
    require(convex, "Synthetic mesh is not convex")
    return {
        "mesh": {
            "watertight": True,
            "convex": convex,
            "vertices": len(mesh.vertices),
            "faces": len(mesh.faces),
            "dimensions_m": list(mesh.extents * metadata["mesh_scale_to_m"]),
        },
        "scenes": [
            validate_scene(folder, name, metadata) for name in ("primitive.xml", "scene.xml")
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bundle",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "examples/simulation/synthetic-box",
    )
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    report = {
        "environment": {
            "python": platform.python_version(),
            "platform": platform.system(),
            "mujoco": mujoco.__version__,
            "trimesh": trimesh.__version__,
            "numpy": np.__version__,
        },
        "scope": "Synthetic fixture only. No reconstructed object or measured real-world fidelity.",
    }
    try:
        report["original"] = validate_bundle(args.bundle.resolve())
        with tempfile.TemporaryDirectory(prefix="photo2sim-portability-") as temporary:
            copy = Path(temporary) / "copied-bundle"
            shutil.copytree(args.bundle, copy)
            report["relocated"] = validate_bundle(copy)
        report["portability_passed"] = True
        report["passed"] = True
    except Exception as exc:
        report.update(passed=False, error=f"{type(exc).__name__}: {exc}")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
