"""Prepared, metre-based AssetRecord to a portable MuJoCo box-collision bundle."""

import json
import shutil
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

import mujoco
import numpy as np
import trimesh

from photo2sim.contracts import AssetRecord, bundle_path
from photo2sim.physics import (
    collision_parameters,
    contact_attributes,
    friction_parameters,
    inertia_parameters,
)
from photo2sim.simulation.portable import write_portable_files

# Numerical smoke-test assumptions, not inferred or measured object properties.
TIMESTEP_S = 0.0001
DROP_HEIGHT_M = 0.02
CONTACT_TIME_S = 0.002
DEFAULT_SLIDING_FRICTION = 0.8


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _local_file(root: Path, relative: str) -> Path:
    path = (root / bundle_path(relative)).resolve(strict=True)
    _require(path.is_relative_to(root.resolve()), "Mesh path escapes asset directory")
    _require(path.is_file(), "Prepared mesh must be a regular file")
    return path


def _dimensions(asset):
    d = asset.properties.dimensions_m
    return np.array([d.x, d.y, d.z], dtype=float)


def _inertia(asset):
    return inertia_parameters(
        asset.properties.physics, asset.properties.mass_kg.value, _dimensions(asset)
    )[1]


def _placement(asset):
    if asset.properties.placement_m is not None:
        return np.asarray(asset.properties.placement_m, dtype=float)
    return np.array([0, 0, _dimensions(asset)[2] / 2 + DROP_HEIGHT_M])


def _check_prepared_mesh(asset, root):
    path = _local_file(root, asset.visual_mesh)
    if path.suffix.lower() not in {".obj", ".stl"}:
        raise NotImplementedError("Export requires a self-contained prepared OBJ or STL in metres")
    if path.suffix.lower() == ".obj":
        # This first exporter preserves geometry only, not external materials/textures.
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip().split(maxsplit=1)[:1] in (["mtllib"], ["usemtl"]):
                raise NotImplementedError(
                    "Textured/material OBJ is unsupported; prepare geometry-only OBJ"
                )
    mesh = trimesh.load_mesh(path, process=False)
    _require(isinstance(mesh, trimesh.Trimesh), "Prepared input must contain one triangle mesh")
    _require(len(mesh.vertices) >= 4 and len(mesh.faces) > 0, "Empty or incomplete prepared mesh")
    _require(np.isfinite(mesh.vertices).all(), "Nonfinite mesh vertices")
    _require(np.isfinite(mesh.area) and mesh.area > 0, "Degenerate mesh")
    dimensions = _dimensions(asset)
    tolerance = max(1e-8, float(dimensions.max()) * 1e-5)
    _require(
        np.allclose(mesh.extents, dimensions, rtol=1e-4, atol=1e-8),
        "Prepared mesh extents disagree with dimensions_m; exporter never rescales",
    )
    _require(
        np.allclose(mesh.bounds.mean(axis=0), 0, atol=tolerance),
        "Prepared mesh must be centred at the origin",
    )
    return path


def _numbers(values):
    return " ".join(format(float(value), ".17g") for value in values)


def _write_scene(asset, folder, assumptions):
    sides = _dimensions(asset)
    root = ET.Element("mujoco", model=f"kamino_{asset.asset_id}")
    ET.SubElement(root, "compiler", angle="radian", inertiafromgeom="false")
    ET.SubElement(
        root, "option", timestep=str(TIMESTEP_S), gravity="0 0 -9.81", integrator="implicitfast"
    )
    ET.SubElement(
        root,
        "statistic",
        center=_numbers(
            _placement(asset) if asset.properties.placement_m is not None else [0, 0, sides[2] / 2]
        ),
        extent=str(max(0.25, sides.max() * 4)),
    )
    default = ET.SubElement(root, "default")
    ET.SubElement(
        default,
        "geom",
        friction=_numbers(assumptions["friction"]),
        solref=_numbers([CONTACT_TIME_S, 1]),
    )
    assets = ET.SubElement(root, "asset")
    ET.SubElement(assets, "mesh", name="prepared_visual", file=asset.visual_mesh, scale="1 1 1")
    if asset.collision.kind == "convex_mesh":
        ET.SubElement(
            assets, "mesh", name="prepared_collision", file=asset.collision.mesh_path, scale="1 1 1"
        )
    world = ET.SubElement(root, "worldbody")
    ET.SubElement(world, "light", pos="0 -0.3 1", dir="0 0 -1")
    ET.SubElement(
        world, "geom", name="ground", type="plane", size="0 0 0.05", rgba="0.35 0.38 0.42 1"
    )
    body = ET.SubElement(world, "body", name="asset", pos=_numbers(_placement(asset)))
    ET.SubElement(body, "freejoint", name="asset_free")
    ET.SubElement(
        body,
        "inertial",
        pos=_numbers(
            inertia_parameters(asset.properties.physics, asset.properties.mass_kg.value, sides)[0]
        ),
        mass=str(asset.properties.mass_kg.value),
        diaginertia=_numbers(_inertia(asset)),
    )
    ET.SubElement(
        body,
        "geom",
        name="visual",
        type="mesh",
        mesh="prepared_visual",
        group="2",
        contype="0",
        conaffinity="0",
        mass="0",
        rgba="0.15 0.65 0.85 1",
    )
    kind, collision_sides, offset = collision_parameters(asset.properties.physics, sides)
    friction, condim = friction_parameters(asset.properties.physics, assumptions["friction"][0])
    collision_attrs = contact_attributes(asset.properties.physics)
    if asset.properties.physics is not None:
        collision_attrs.update(friction=_numbers(friction), condim=str(condim))
    if kind == "convex_hull":
        collision_attrs.update(type="mesh", mesh="prepared_collision")
    else:
        collision_attrs.update(type="box", size=_numbers(collision_sides / 2))
    if np.any(offset):
        collision_attrs["pos"] = _numbers(offset)
    ET.SubElement(
        body,
        "geom",
        name="collision",
        group="3",
        rgba="0.9 0.35 0.15 1",
        **collision_attrs,
    )
    ET.indent(root)
    ET.ElementTree(root).write(folder / "scene.xml", encoding="utf-8", xml_declaration=True)


def export_asset(asset: AssetRecord, asset_dir: Path, output_dir: Path) -> Path:
    """Publish a new bundle and return scene.xml; reject existing output directories.

    Prepared meshes must already be centred and dimensioned in metres. No mesh
    preparation, rescaling, reconstruction, source edits or dynamic validation occurs here.
    """
    asset = AssetRecord.model_validate(asset.model_dump(mode="json"))
    source = _check_prepared_mesh(asset, Path(asset_dir))
    kind, collision_sides, offset = collision_parameters(
        asset.properties.physics, _dimensions(asset)
    )
    _require(
        (kind == "convex_hull") == (asset.collision.kind == "convex_mesh"),
        "Prepared collision geometry disagrees with saved physics; prepare a new asset",
    )
    collision_source = None
    if kind == "convex_hull":
        collision_source = _local_file(Path(asset_dir), asset.collision.mesh_path)
        hull = trimesh.load_mesh(collision_source, process=True)
        expected_hull = trimesh.load_mesh(source, process=True).convex_hull
        _require(
            isinstance(hull, trimesh.Trimesh)
            and hull.is_convex
            and hull.is_watertight
            and np.isfinite(hull.vertices).all()
            and hull.volume > 0,
            "Prepared convex collision must be a finite closed convex volume",
        )
        _require(
            np.allclose(hull.bounds, expected_hull.bounds, rtol=1e-5, atol=1e-8)
            and np.isclose(hull.volume, expected_hull.volume, rtol=1e-5, atol=1e-12),
            "Prepared convex collision disagrees with visual geometry hull",
        )
    inertia = _inertia(asset)
    _require(
        np.isfinite(inertia).all() and np.all(inertia > 0),
        "Dimensions/mass do not produce finite positive box inertia",
    )
    output = Path(output_dir).absolute()
    if output.exists() or output.is_symlink():
        raise FileExistsError(
            "Choose a new output directory; existing exports are never overwritten"
        )
    friction = asset.properties.sliding_friction
    assumptions = {
        "format": "photo2sim-box-export/1",
        "units": {"length": "m", "mass": "kg", "time": "s", "inertia": "kg*m^2"},
        "prepared_mesh_scale": [1, 1, 1],
        "inertia": {
            "method": "uniform_cuboid_approximation",
            "diagonal_kg_m2": _inertia(asset).tolist(),
            "note": "Approximates the confirmed bounding box as uniformly filled; not measured inertia",
        },
        "collision": "centred axis-aligned box; full property extents divided by two",
        "friction": [
            DEFAULT_SLIDING_FRICTION if friction is None else friction.value,
            0.005,
            0.0001,
        ],
        "sliding_friction_source": "simulation_default_not_measured"
        if friction is None
        else friction.source,
        "friction_note": "Original property/provenance is preserved in asset.json; torsional and rolling terms are assumed defaults",
        "timestep_s": TIMESTEP_S,
        "gravity_m_s2": [0, 0, -9.81],
        "initial_bottom_height_m": DROP_HEIGHT_M,
        "contact_solref": [CONTACT_TIME_S, 1],
        "numerical_note": "20 substeps per contact time constant; modest 20 mm upright drop; not calibrated material response",
        "status": "load_checked_only; run validate_export for dynamic evidence",
    }
    if asset.properties.physics is not None or asset.properties.placement_m is not None:
        physics = asset.properties.physics
        contact = contact_attributes(physics)
        applied_friction, condim = friction_parameters(physics, assumptions["friction"][0])
        com, inertia = inertia_parameters(
            physics, asset.properties.mass_kg.value, _dimensions(asset)
        )
        manual = (
            physics is not None and physics.inertia is not None and physics.inertia.mode == "manual"
        )
        assumptions.update(
            format="photo2sim-physics-export/1",
            collision={
                "kind": kind,
                "full_size_m": collision_sides.tolist() if kind == "box" else None,
                "offset_m": offset.tolist(),
                "note": "Convex hull of prepared vertices; concavities filled"
                if kind == "convex_hull"
                else "Axis-aligned box proxy",
            },
            inertia={
                "method": "manual_diagonal" if manual else "uniform_cuboid_approximation",
                "center_of_mass_m": com.tolist(),
                "diagonal_kg_m2": inertia.tolist(),
                "source": physics.inertia.source if manual else "estimated",
                "note": "Manual diagonal tensor about COM in body axes; provenance retained in source"
                if manual
                else "Uniform solid bounding cuboid approximation, including for convex hulls; not measured inertia",
            },
            friction=applied_friction.tolist(),
            contact_condim=condim,
            friction_note="Sliding is dimensionless; torsional and rolling coefficients are metres. Historical coefficients stay inactive when omitted. Rolling-only sets omitted twist to zero because condim=6 enables both; explicit nonzero spin/roll activates the required contact dimensions.",
            initial_body_position_m=_placement(asset).tolist(),
            initial_bottom_height_m=float(
                _placement(asset)[2] + offset[2] - collision_sides[2] / 2
            ),
            contact_solref=[float(v) for v in contact.get("solref", f"{CONTACT_TIME_S} 1").split()],
            contact_solimp=[
                float(v) for v in contact.get("solimp", "0.9 0.95 0.001 0.5 2").split()
            ],
            contact_note="Firm/soft time constants and low/medium/high underdamping presets are numerical assumptions, not restitution coefficients or measured materials.",
            numerical_note="Explicit physics/placement: finite-state smoke validation only; no upright box settling or real-world accuracy claim.",
        )
    # Work in a sibling staging directory. The target is absent until all preflight/load checks pass.
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".photo2sim-export-", dir=output.parent) as temporary:
        stage = Path(temporary) / "bundle"
        mesh_target = stage / asset.visual_mesh
        mesh_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, mesh_target)
        if collision_source is not None:
            collision_target = stage / asset.collision.mesh_path
            collision_target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(collision_source, collision_target)
        (stage / "asset.json").write_text(asset.model_dump_json(indent=2) + "\n", encoding="utf-8")
        (stage / "simulation.json").write_text(
            json.dumps(assumptions, indent=2) + "\n", encoding="utf-8"
        )
        _write_scene(asset, stage, assumptions)
        write_portable_files(stage, asset.model_dump(mode="json"), assumptions)
        mujoco.MjModel.from_xml_path(str(stage / "scene.xml"))
        if output.exists() or output.is_symlink():
            raise FileExistsError("Output appeared during export; nothing was overwritten")
        stage.rename(output)
    return output / "scene.xml"
