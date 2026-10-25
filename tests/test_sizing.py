"""Preserve source proportions; never substitute a body-only measurement for a full extent."""

from copy import deepcopy

import numpy as np
import pytest
import trimesh
from pydantic import ValidationError

from photo2sim.assets.prepare import prepare_asset
from photo2sim.contracts import AssetProperties, Orientation
from photo2sim.simulation.export import export_asset


def uniform(axis="y", length=60, orientation=None):
    return {
        "mode": "uniform",
        "reviewed_orientation": orientation or {"x_deg": 0, "y_deg": 0, "z_deg": 0},
        "reference": {
            "axis": axis,
            "length": length,
            "unit": "mm",
            "source": "user_supplied",
            "correspondence": "full_mesh_extent",
            "description": "Full synthetic object extent, including protrusions",
        },
    }


def properties(sizing=None):
    value = {
        "dimensions_m": {"x": 0.043, "y": 0.027, "z": 0.060, "source": "estimated"},
        "mass_kg": {"value": 0.058, "source": "estimated"},
    }
    if sizing is not None:
        value["sizing"] = sizing
    return AssetProperties.model_validate(value)


@pytest.mark.parametrize(
    "orientation,axis,expected",
    [(Orientation(), "y", [0.02, 0.06, 0.04]), (Orientation(x_deg=90), "z", [0.02, 0.04, 0.06])],
)
def test_uniform_sizing_preserves_all_edge_lengths_and_selected_oriented_extent(
    tmp_path, orientation, axis, expected
):
    source = tmp_path / "source.glb"
    original = trimesh.creation.box(extents=(1, 3, 2))
    original.export(source)
    before = source.read_bytes()
    props = properties(uniform(axis, orientation=orientation.model_dump()))
    asset = prepare_asset(source, tmp_path / "prepared", props, orientation=orientation)
    mesh = trimesh.load_mesh(tmp_path / "prepared" / asset.visual_mesh, process=False)
    assert np.allclose(mesh.extents, expected)
    assert np.allclose(
        np.sort(mesh.edges_unique_length), np.sort(original.edges_unique_length) * 0.02
    )
    assert source.read_bytes() == before
    assert asset.sizing_result.mode == "uniform"
    assert asset.sizing_result.scale_factors == pytest.approx((0.02, 0.02, 0.02))
    assert asset.properties.dimensions_m.source == "estimated"
    assert asset.properties.sizing.reference.source == "user_supplied"
    scene = export_asset(asset, tmp_path / "prepared", tmp_path / "export")
    import mujoco

    model = mujoco.MjModel.from_xml_path(str(scene))
    idx = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, "collision")
    assert model.geom_size[idx] == pytest.approx(np.array(expected) / 2)
    body = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, "asset")
    sides = np.array(expected)
    assert model.body_inertia[body] == pytest.approx(0.058 * (sum(sides**2) - sides**2) / 12)


@pytest.mark.parametrize(
    "field,value",
    [
        ("length", 0),
        ("length", -1),
        ("length", float("inf")),
        ("length", True),
        ("axis", "longest"),
        ("unit", "inches"),
        ("correspondence", "body_only"),
        ("description", "   "),
    ],
)
def test_invalid_reference_is_rejected(field, value):
    sizing = uniform()
    sizing["reference"][field] = value
    with pytest.raises(ValidationError):
        properties(sizing)


def test_changed_orientation_requires_reference_review_again(tmp_path):
    source = tmp_path / "source.obj"
    trimesh.creation.box(extents=(1, 3, 2)).export(source)
    with pytest.raises(ValueError, match="orientation|review"):
        prepare_asset(
            source, tmp_path / "prepared", properties(uniform()), orientation=Orientation(x_deg=90)
        )
    assert not (tmp_path / "prepared").exists()


def test_independent_sizing_requires_explicit_distortion_acknowledgement(tmp_path):
    sizing = {"mode": "independent_axes", "reviewed_orientation": Orientation().model_dump()}
    with pytest.raises(ValidationError):
        properties(sizing)
    sizing["acknowledge_distortion"] = True
    source = tmp_path / "source.obj"
    trimesh.creation.box(extents=(1, 3, 2)).export(source)
    asset = prepare_asset(source, tmp_path / "prepared", properties(sizing))
    assert asset.sizing_result.mode == "independent_axes"
    mesh = trimesh.load_mesh(tmp_path / "prepared" / asset.visual_mesh, process=False)
    assert mesh.extents == pytest.approx([0.043, 0.027, 0.060])


def test_absent_sizing_remains_explicitly_labeled_legacy(tmp_path):
    source = tmp_path / "source.obj"
    trimesh.creation.box(extents=(1, 3, 2)).export(source)
    props = properties()
    before = deepcopy(props.model_dump())
    asset = prepare_asset(source, tmp_path / "prepared", props)
    assert asset.sizing_result.mode == "legacy_independent_axes"
    assert props.model_dump() == before
    assert asset.properties == props
    assert any("legacy" in note.lower() for note in asset.notes)
