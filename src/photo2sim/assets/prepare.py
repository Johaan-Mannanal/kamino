"""Turn a reconstructed OBJ/GLB into a centred, metre-scaled visual mesh bundle."""

import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

import numpy as np
import trimesh

from photo2sim.assets.sizing import resolve_sizing, rotate_mesh
from photo2sim.contracts import AssetProperties, AssetRecord, CollisionGeometry, Orientation

SUPPORTED_EXTENSIONS = {".obj": "obj", ".glb": "glb"}
VISUAL_MESH = "meshes/visual.obj"
COLLISION_MESH = "meshes/collision.obj"
DISTORTION_TOLERANCE = 0.01
# Relative to the largest extent; below this an axis or the surface is treated as collapsed.
DEGENERATE_TOLERANCE = 1e-9


class AssetPreparationError(ValueError):
    """The input mesh or output location cannot produce a valid asset bundle."""


def prepare_asset(
    mesh_path: Path,
    output_dir: Path,
    properties: AssetProperties,
    *,
    orientation: Orientation | None = None,
    geometry_review=None,
) -> AssetRecord:
    """Centre, scale, and export ``mesh_path`` into ``output_dir``.

    Orientation is not inferred: explicit fixed-axis X/Y/Z rotations are applied
    before centring and scaling. Omission preserves the input axes. Each axis is
    scaled uniformly from an explicit reference, or independently only for an
    explicit advanced request or historical properties with no sizing metadata.
    The input file is never modified, and nothing is left in ``output_dir`` on failure.
    """
    mesh_path = Path(mesh_path)
    output_dir = Path(output_dir)
    _check_output_dir(output_dir)
    if geometry_review is None:
        mesh, baked_transforms = _load_mesh(mesh_path)
    else:
        from photo2sim.assets.target import selected_geometry

        mesh = selected_geometry(mesh_path, geometry_review)
        baked_transforms = 0  # Already baked by the source-bound inventory loader.
    _check_geometry(mesh, mesh_path)
    orientation = Orientation.model_validate(orientation or Orientation())
    if geometry_review is not None and geometry_review.orientation != orientation:
        raise ValueError("Orientation changed; review target geometry again")
    rotate_mesh(mesh, orientation)
    source_centre = mesh.bounds.mean(axis=0)
    source_extents = mesh.extents.copy()
    properties, sizing_result = resolve_sizing(source_extents, properties, orientation)
    target = np.array([getattr(properties.dimensions_m, axis) for axis in "xyz"])
    scale = np.array(sizing_result.scale_factors)
    mesh.vertices = (mesh.vertices - source_centre) * scale

    collision_settings = properties.physics.collision if properties.physics else None
    hull = None
    if collision_settings and collision_settings.kind == "convex_hull":
        try:
            hull = mesh.convex_hull
            if not np.isfinite(hull.volume) or hull.volume <= 0 or not hull.is_watertight:
                raise ValueError("Hull must enclose a finite positive volume")
        except Exception as error:
            raise AssetPreparationError(
                f"Could not compute convex hull from prepared vertices: {error}"
            ) from error
    _write_bundle(mesh, output_dir, hull)

    notes = _notes(mesh_path, source_extents, source_centre, target, scale, baked_transforms)
    if collision_settings:
        notes[-1] = (
            "Collision is a convex hull computed from the prepared mesh vertices; concavities "
            "are filled, not measured contact geometry."
            if hull is not None
            else "Collision uses the explicit box dimensions (or confirmed extents when omitted) "
            "and body-local offset in metres; not measured contact geometry."
        )
    if sizing_result.mode == "uniform":
        notes[2] = (
            f"Uniform scalar {scale[0]:.12g} applied after reviewed orientation; "
            "source proportions preserved. " + properties.dimensions_m.note
        )
    elif sizing_result.mode == "legacy_independent_axes":
        notes.append(
            "Legacy three-axis sizing retained for backward compatibility; proportions may be distorted."
        )
    else:
        notes.append("Advanced independent-axis stretching explicitly acknowledged by the user.")
    if any((orientation.x_deg, orientation.y_deg, orientation.z_deg)):
        notes[0] = (
            "Explicit right-handed rotation before centring and dimension scaling: "
            f"fixed X={orientation.x_deg:g}, Y={orientation.y_deg:g}, Z={orientation.z_deg:g} "
            "degrees, applied in X then Y then Z order (Rz @ Ry @ Rx). "
            "Dimensions refer to the resulting axes. Orientation was not inferred."
        )
    return AssetRecord(
        asset_id=uuid4(),
        visual_mesh=VISUAL_MESH,
        properties=properties,
        collision=CollisionGeometry(kind="convex_mesh", mesh_path=COLLISION_MESH)
        if hull is not None
        else CollisionGeometry(kind="box"),
        synthetic=False,
        notes=notes,
        orientation=orientation,
        sizing_result=sizing_result,
        geometry_review=geometry_review,
    )


def _check_output_dir(output_dir: Path) -> None:
    if output_dir.exists() and not output_dir.is_dir():
        raise AssetPreparationError(f"Output path {output_dir} exists and is not a directory")
    if output_dir.is_dir() and any(output_dir.iterdir()):
        raise AssetPreparationError(
            f"Output directory {output_dir} is not empty; refusing to overwrite existing files"
        )


def _load_mesh(mesh_path: Path) -> tuple[trimesh.Trimesh, int]:
    if not mesh_path.is_file():
        raise AssetPreparationError(f"Input mesh {mesh_path} does not exist or is not a file")
    file_type = SUPPORTED_EXTENSIONS.get(mesh_path.suffix.lower())
    if file_type is None:
        raise AssetPreparationError(
            f"Unsupported mesh extension {mesh_path.suffix or '(none)'!r} for {mesh_path.name}; "
            "expected .obj or .glb"
        )
    if mesh_path.stat().st_size == 0:
        raise AssetPreparationError(f"Input mesh {mesh_path.name} is an empty file")

    try:
        with mesh_path.open("rb") as stream:
            scene = trimesh.load(stream, file_type=file_type, force="scene", process=False)
        geometries = scene.dump()
    except Exception as error:
        raise AssetPreparationError(
            f"Could not parse {mesh_path.name} as a {file_type.upper()} mesh: {error}"
        ) from error

    baked_transforms = sum(
        not np.allclose(scene.graph[node][0], np.eye(4)) for node in scene.graph.nodes_geometry
    )
    meshes = [g for g in geometries if isinstance(g, trimesh.Trimesh) and len(g.faces) > 0]
    if not meshes:
        raise AssetPreparationError(
            f"Input mesh {mesh_path.name} contains no triangle faces (empty or point-only geometry)"
        )
    mesh = meshes[0].copy() if len(meshes) == 1 else trimesh.util.concatenate(meshes)
    return mesh, baked_transforms


def _check_geometry(mesh: trimesh.Trimesh, mesh_path: Path) -> None:
    if (mesh.faces < 0).any() or (mesh.faces >= len(mesh.vertices)).any():
        raise AssetPreparationError(
            f"Input mesh {mesh_path.name} has faces referring to invalid vertex indices"
        )
    if not np.isfinite(mesh.vertices).all():
        raise AssetPreparationError(
            f"Input mesh {mesh_path.name} has non-finite (NaN or infinite) vertex coordinates"
        )
    mesh.remove_unreferenced_vertices()
    extents = mesh.extents
    largest = float(extents.max())
    if largest <= 0 or float(extents.min()) <= DEGENERATE_TOLERANCE * largest:
        raise AssetPreparationError(
            f"Input mesh {mesh_path.name} is degenerate: bounding-box extents "
            f"{_format_vector(extents)} collapse to zero along at least one axis"
        )
    if mesh.area <= DEGENERATE_TOLERANCE * largest**2:
        raise AssetPreparationError(
            f"Input mesh {mesh_path.name} is degenerate: all faces have zero area"
        )


def _write_bundle(mesh: trimesh.Trimesh, output_dir: Path, hull=None) -> None:
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".photo2sim-prepare-", dir=output_dir.parent))
    created_output = not output_dir.exists()
    moved: list[Path] = []
    try:
        target = staging.joinpath(*VISUAL_MESH.split("/"))
        target.parent.mkdir(parents=True)
        mesh.export(target, file_type="obj", digits=17)
        if hull is not None:
            hull.export(staging / COLLISION_MESH, file_type="obj", digits=17)
        output_dir.mkdir(exist_ok=True)
        for child in staging.iterdir():
            destination = output_dir / child.name
            shutil.move(child, destination)
            moved.append(destination)
    except Exception as error:
        for path in moved:
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            else:
                path.unlink(missing_ok=True)
        if created_output:
            shutil.rmtree(output_dir, ignore_errors=True)
        raise AssetPreparationError(f"Could not write asset bundle to {output_dir}: {error}") from (
            error
        )
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def _notes(
    mesh_path: Path,
    source_extents: np.ndarray,
    source_centre: np.ndarray,
    target: np.ndarray,
    scale: np.ndarray,
    baked_transforms: int,
) -> list[str]:
    notes = [
        "Orientation: the input mesh axes are assumed to already match the requested x/y/z "
        "dimension axes; no rotation or axis permutation was applied."
        + (
            " The GLB was read in its native glTF frame (+Y up) without conversion."
            if mesh_path.suffix.lower() == ".glb"
            else ""
        ),
        f"Bounding box centred at the origin; source centre was {_format_vector(source_centre)} "
        "in input units.",
        f"Scaled per axis independently from source extents {_format_vector(source_extents)} "
        f"(input units, treated as unknown) to confirmed full extents {_format_vector(target)} m.",
    ]
    ratios = scale / scale.min()
    spread = float(scale.max() / scale.min()) - 1
    if spread > DISTORTION_TOLERANCE:
        notes.append(
            f"Nonuniform distortion: per-axis scale factors differ by up to {spread:.1%} "
            f"(x:y:z ratio {ratios[0]:.3f}:{ratios[1]:.3f}:{ratios[2]:.3f}); the mesh's "
            "proportions did not match the confirmed dimensions."
        )
    else:
        notes.append(
            f"Per-axis scale factors agree within {DISTORTION_TOLERANCE:.0%}; no significant "
            "nonuniform distortion."
        )
    if baked_transforms:
        notes.append(f"Baked {baked_transforms} scene node transform(s) into mesh vertices.")
    notes.append(
        "Collision is a box centred at the origin with the confirmed dimensions; mass and "
        "friction were passed through unchanged and not inferred from geometry."
    )
    return notes


def _format_vector(values: np.ndarray) -> str:
    return "(" + ", ".join(f"{float(value):.6g}" for value in values) + ")"
