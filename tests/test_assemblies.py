"""Reviewed assembly boundary: units, provenance, and a connected kinematic tree."""

import copy

import pytest
from pydantic import ValidationError


def assembly_input():
    return {
        "schema_version": "assembly-1.0",
        "name": "two_link_hinge",
        "synthetic": True,
        "root_link": "base",
        "root_pose": {"position_m": [0, 0, 0.25]},
        "links": [
            {
                "name": name,
                "visual_mesh": f"meshes/{name}.obj",
                "geometry_source": "estimated",
                "geometry_note": "Synthetic test geometry; vertices in link coordinates, metres",
                "mass_kg": {"value": mass, "source": "estimated", "note": "Synthetic assumption"},
            }
            for name, mass in [("base", 0.5), ("arm", 0.1)]
        ],
        "joints": [
            {
                "name": "hinge",
                "parent": "base",
                "child": "arm",
                "kind": "revolute",
                "origin": {"position_m": [0, 0, 0.06]},
                "axis": [0, 0, 1],
                "limits_rad": [-0.8, 0.8],
                "source": "user_supplied",
                "note": "Reviewed synthetic hinge, not inferred from photos",
                "damping": {"value": 0.2, "source": "estimated"},
                "drive": {"kp": 5, "force_limit_nm": 2, "source": "estimated"},
            }
        ],
    }


def parse(payload):
    from photo2sim.assemblies.contracts import AssemblyRecord

    return AssemblyRecord.model_validate(payload)


def test_roundtrip_retains_provenance_and_defaults():
    a = parse(assembly_input())
    b = type(a).model_validate_json(a.model_dump_json())
    assert b == a
    assert b.synthetic is True
    assert b.links[1].mass_kg.source == "estimated"
    assert b.links[1].sliding_friction is None
    assert b.joints[0].origin.quaternion_wxyz == (1, 0, 0, 0)


@pytest.mark.parametrize(
    "case",
    [
        "duplicate_link",
        "duplicate_joint",
        "missing_parent",
        "cycle",
        "orphan",
        "two_parents",
        "root_parent",
    ],
)
def test_rejects_invalid_tree(case):
    a = assembly_input()
    j = a["joints"][0]
    if case == "duplicate_link":
        a["links"].append(copy.deepcopy(a["links"][0]))
    elif case == "duplicate_joint":
        a["joints"].append(copy.deepcopy(j))
    elif case == "missing_parent":
        j["parent"] = "missing"
    elif case == "cycle":
        a["links"].append({**a["links"][1], "name": "other"})
        j["parent"] = "other"
        a["joints"].append({**j, "name": "back", "parent": "arm", "child": "other"})
    elif case == "orphan":
        a["joints"] = []
    elif case == "two_parents":
        a["joints"].append({**j, "name": "second"})
    else:
        j["child"] = "base"
    with pytest.raises(ValidationError):
        parse(a)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("axis", [0, 0, 0]),
        ("axis", [0, 0, 2]),
        ("axis", [float("nan"), 0, 1]),
        ("limits_rad", [1, -1]),
        ("limits_rad", [0.1, 1]),
        ("limits_rad", [0, 0]),
        ("limits_rad", [-1, float("inf")]),
        ("kind", "prismatic"),
        ("origin", {"quaternion_wxyz": [2, 0, 0, 0]}),
        ("origin", {"position_m": [float("nan"), 0, 0]}),
        ("drive", {"kp": 0, "force_limit_nm": 1, "source": "estimated"}),
        ("drive", None),
        ("damping", {"value": -1, "source": "estimated"}),
    ],
)
def test_rejects_invalid_joint(field, value):
    a = assembly_input()
    a["joints"][0][field] = value
    with pytest.raises(ValidationError):
        parse(a)


@pytest.mark.parametrize(
    "path", ["../outside.obj", "/tmp/a.obj", "C:/a.obj", "a\\b.obj", "a//b.obj"]
)
def test_rejects_nonportable_paths(path):
    a = assembly_input()
    a["links"][0]["visual_mesh"] = path
    with pytest.raises(ValidationError):
        parse(a)


def test_rejects_zero_mass_and_unsafe_name():
    a = assembly_input()
    a["links"][0]["mass_kg"]["value"] = 0
    with pytest.raises(ValidationError):
        parse(a)
    a = assembly_input()
    a["name"] = "../elsewhere"
    with pytest.raises(ValidationError):
        parse(a)


def test_fixed_joint_has_no_hinge_parameters():
    a = assembly_input()
    a["joints"][0] = {
        "name": "fixed",
        "parent": "base",
        "child": "arm",
        "kind": "fixed",
        "source": "user_supplied",
    }
    assert parse(a).joints[0].kind == "fixed"
    a["joints"][0]["axis"] = [0, 0, 1]
    with pytest.raises(ValidationError):
        parse(a)
