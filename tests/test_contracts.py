from uuid import uuid4

import pytest
from pydantic import ValidationError

from photo2sim.contracts import AssetProperties, AssetRecord, CollisionGeometry


def properties():
    return {
        "dimensions_m": {"x": 0.04, "y": 0.05, "z": 0.06, "source": "measured"},
        "mass_kg": {"value": 0.08, "source": "user_supplied"},
    }


@pytest.mark.parametrize("value", [0, -1, float("nan"), float("inf")])
def test_nonphysical_dimensions_are_rejected(value):
    data = properties()
    data["dimensions_m"]["x"] = value
    with pytest.raises(ValidationError):
        AssetProperties.model_validate(data)


def test_unknown_properties_stay_absent_and_provenance_survives():
    result = AssetProperties.model_validate(properties()).model_dump(mode="json")
    assert result["sliding_friction"] is None
    assert result["dimensions_m"]["source"] == "measured"
    assert result["mass_kg"]["source"] == "user_supplied"


def test_zero_mass_is_rejected_but_zero_friction_is_valid():
    data = properties()
    data["mass_kg"]["value"] = 0
    with pytest.raises(ValidationError):
        AssetProperties.model_validate(data)
    data = properties()
    data["sliding_friction"] = {"value": 0, "source": "estimated"}
    assert AssetProperties.model_validate(data).sliding_friction.value == 0


@pytest.mark.parametrize("path", ["../mesh.obj", "/mesh.obj", "C:/mesh.obj", "a\\mesh.obj"])
def test_asset_paths_must_be_portable_and_stay_inside_bundle(path):
    with pytest.raises(ValidationError):
        AssetRecord(
            asset_id=uuid4(),
            visual_mesh=path,
            properties=properties(),
            collision={"kind": "box"},
        )


def test_convex_collision_requires_its_own_mesh_path():
    with pytest.raises(ValidationError):
        CollisionGeometry(kind="convex_mesh")


def test_valid_asset_round_trips_without_machine_paths():
    asset = AssetRecord(
        asset_id=uuid4(),
        visual_mesh="meshes/visual.obj",
        properties=properties(),
        collision={"kind": "convex_mesh", "mesh_path": "meshes/collision.obj"},
    )
    assert AssetRecord.model_validate_json(asset.model_dump_json()) == asset
