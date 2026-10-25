"""Sizing against reviewed full oriented extents; original mesh units stay unknown."""

from pathlib import Path

import numpy as np

from photo2sim.contracts import AssetProperties, Dimensions, Orientation, SizingResult


def rotate_mesh(mesh, orientation: Orientation):
    x, y, z = np.deg2rad([orientation.x_deg, orientation.y_deg, orientation.z_deg])
    cx, cy, cz = np.cos([x, y, z])
    sx, sy, sz = np.sin([x, y, z])
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    rotation = rz @ ry @ rx
    rotation[np.abs(rotation) < 1e-15] = 0
    mesh.vertices = mesh.vertices @ rotation.T


def resolve_sizing(extents, properties: AssetProperties, orientation: Orientation):
    """Return authoritative properties/result without changing supplied properties."""
    extents = np.asarray(extents, dtype=float)
    if extents.shape != (3,) or not np.isfinite(extents).all() or np.any(extents <= 0):
        raise ValueError("Three positive finite source extents are required")
    sizing = properties.sizing
    mode = sizing.mode if sizing else "legacy_independent_axes"
    if sizing and sizing.reviewed_orientation != orientation:
        raise ValueError("Orientation changed; review and save the sizing reference again")
    ref_extent = None
    if mode == "uniform":
        reference = sizing.reference
        index = "xyz".index(reference.axis)
        ref_extent = float(extents[index])
        length_m = reference.length * (0.001 if reference.unit == "mm" else 1)
        scale = np.full(3, length_m / ref_extent)
        target = extents * scale
        dims = Dimensions(
            **dict(zip("xyz", target)),
            source="estimated",
            note=f"Derived mesh extents from uniform sizing; reference {reference.length:g} "
            f"{reference.unit} on full {reference.axis.upper()} extent ({reference.source}). "
            f"{reference.description}. Other dimensions are not independent measurements.",
        )
        properties = properties.model_copy(update={"dimensions_m": dims})
    else:
        dims = properties.dimensions_m
        target = np.array([dims.x, dims.y, dims.z])
        scale = target / extents
    if not np.isfinite(scale).all() or np.any(scale <= 0):
        raise ValueError("Sizing produced invalid scale factors")
    result = SizingResult(
        mode=mode,
        orientation=orientation,
        source_extents_input_units=tuple(extents),
        scale_factors=tuple(scale),
        resulting_dimensions_m=dims,
        reference_extent_input_units=ref_extent,
    )
    return properties, result


def preview_sizing(mesh_path: Path, properties: AssetProperties, orientation: Orientation):
    # Lazy import avoids a preparation/sizing import cycle and keeps HTTP setup
    # usable without optional simulation dependencies.
    from photo2sim.assets.prepare import _check_geometry, _load_mesh

    mesh, _ = _load_mesh(mesh_path)
    _check_geometry(mesh, mesh_path)
    rotate_mesh(mesh, orientation)
    return resolve_sizing(mesh.extents, properties, orientation)
