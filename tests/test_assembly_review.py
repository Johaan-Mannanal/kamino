"""Guided grouping preserves common-frame geometry and explicit review gates."""

import hashlib
import json
import math

import numpy as np
import pytest
import trimesh


def reviewed(raw):
    from photo2sim.assemblies.review import ReviewProject, review_snapshot

    p = ReviewProject.model_validate(raw)
    p.review_snapshot = review_snapshot(p)
    return p


def functions():
    from photo2sim.assemblies.review import ReviewProject, prepare_review, review_package

    return ReviewProject, prepare_review, review_package


@pytest.fixture
def project(tmp_path):
    mesh = trimesh.creation.box(extents=[0.02, 0.03, 0.04])
    mesh.export(tmp_path / "part.obj")
    sha = hashlib.sha256((tmp_path / "part.obj").read_bytes()).hexdigest()
    scalar = {"value": 0.1, "source": "estimated", "note": "test assumption"}
    return {
        "name": "review_test",
        "synthetic": True,
        "root_link": "base",
        "parts": [
            {
                "id": "p0",
                "mesh": "part.obj",
                "sha256": sha,
                "source": "user_supplied",
                "note": "Synthetic box",
                "group": "base",
            },
            {
                "id": "p1",
                "mesh": "part.obj",
                "sha256": sha,
                "source": "user_supplied",
                "note": "Synthetic box",
                "group": "arm",
                "pose": {"position_m": [0.2, 0, 0.1]},
            },
        ],
        "groups": [
            {"name": "base", "mass_kg": scalar, "reviewed": True, "review_note": "Fixture"},
            {
                "name": "arm",
                "mass_kg": scalar,
                "reviewed": True,
                "review_note": "Fixture",
                "frame": {
                    "position_m": [0.1, 0, 0.1],
                    "quaternion_wxyz": [math.sqrt(0.5), 0, 0, math.sqrt(0.5)],
                },
            },
        ],
        "joints": [
            {
                "name": "hinge",
                "parent": "base",
                "child": "arm",
                "kind": "revolute",
                "axis": [0, 0, 1],
                "limits_rad": [-1, 1],
                "source": "user_supplied",
                "damping": scalar,
                "drive": {"kp": 5, "force_limit_nm": 2, "source": "estimated"},
                "reviewed": True,
                "review_note": "Fixture pivot",
            }
        ],
        "notes": ["All dimensions synthetic"],
    }, tmp_path


def test_grouping_transforms_and_provenance(project):
    Model, prepare, _ = functions()
    raw, root = project
    output = root / "prepared"
    path = prepare(reviewed(raw), root, output)
    record = json.loads(path.read_text())
    arm = trimesh.load_mesh(output / "meshes/arm.obj")
    assert arm.bounds.mean(axis=0) == pytest.approx([0, -0.1, 0], abs=1e-8)
    assert arm.extents == pytest.approx([0.03, 0.02, 0.04], abs=1e-8)
    assert record["joints"][0]["origin"]["position_m"] == pytest.approx([0.1, 0, 0.1])
    assert record["links"][1]["mass_kg"]["source"] == "estimated"
    audit = json.loads((output / "grouping.json").read_text())
    assert audit["parts"]["p1"]["group"] == "arm"
    assert audit["parts"]["p1"]["sha256"] == raw["parts"][1]["sha256"]
    assert json.loads((output / "review-project.json").read_text())["synthetic"]


@pytest.mark.parametrize(
    "change",
    [
        "group_review",
        "joint_review",
        "unassigned",
        "unknown_group",
        "duplicate_part",
        "empty_group",
        "cycle",
    ],
)
def test_invalid_or_unreviewed_never_publishes(project, change):
    Model, prepare, _ = functions()
    raw, root = project
    if change == "group_review":
        raw["groups"][0]["reviewed"] = False
    elif change == "joint_review":
        raw["joints"][0]["review_note"] = ""
    elif change == "unassigned":
        raw["parts"][0]["group"] = None
    elif change == "unknown_group":
        raw["parts"][0]["group"] = "missing"
    elif change == "duplicate_part":
        raw["parts"][1]["id"] = "p0"
    elif change == "empty_group":
        raw["parts"][1]["group"] = "base"
    elif change == "cycle":
        raw["joints"][0]["parent"] = "arm"
    with pytest.raises(ValueError):
        prepare(reviewed(raw), root, root / "bad")
    assert not (root / "bad").exists()


def test_explicit_exclusion_is_recorded(project):
    Model, prepare, _ = functions()
    raw, root = project
    raw["parts"].append(
        {
            **raw["parts"][0],
            "id": "omitted",
            "group": None,
            "excluded_reason": "Fixture duplicate, deliberately omitted",
        }
    )
    output = root / "excluded"
    prepare(reviewed(raw), root, output)
    assert "deliberately omitted" in (output / "grouping.json").read_text()


def test_hash_and_containment_and_no_overwrite(project):
    Model, prepare, _ = functions()
    raw, root = project
    raw["parts"][0]["sha256"] = "0" * 64
    with pytest.raises(ValueError, match="hash"):
        prepare(reviewed(raw), root, root / "bad")
    assert not (root / "bad").exists()
    raw["parts"][0]["mesh"] = "../part.obj"
    with pytest.raises(ValueError):
        Model.model_validate(raw)


def test_revisions_keep_sources_and_previous_output(project):
    Model, prepare, package = functions()
    raw, root = project
    p = reviewed(raw)
    prepare(p, root, root / "v1")
    with pytest.raises(FileExistsError):
        prepare(p, root, root / "v1")
    raw["groups"][1]["frame"]["position_m"] = [0.15, 0, 0.1]
    prepare(reviewed(raw), root, root / "v2")
    old = trimesh.load_mesh(root / "v1/meshes/arm.obj")
    new = trimesh.load_mesh(root / "v2/meshes/arm.obj")
    assert old.bounds.mean(axis=0)[1] == pytest.approx(-0.1)
    assert new.bounds.mean(axis=0)[1] == pytest.approx(-0.05)
    payload = package(p, root)
    assert payload["project"]["name"] == "review_test"
    assert len(payload["geometry"]["p1"]["vertices"]) >= 8
    assert payload["geometry"]["p1"]["bounds_m"] == pytest.approx(
        np.array([[-0.01, -0.015, -0.02], [0.01, 0.015, 0.02]])
    )


def test_package_allows_incomplete_review(project):
    Model, _, package = functions()
    raw, root = project
    raw["parts"][0]["group"] = None
    raw["groups"][0]["reviewed"] = False
    assert package(Model.model_validate(raw), root)["project"]["groups"][0]["reviewed"] is False


def test_cli_review_and_prepare(project):
    import subprocess
    import sys

    raw, root = project
    record = root / "project.json"
    record.write_text(reviewed(raw).model_dump_json())
    for args in (
        ["package", str(record), "--output", str(root / "review.json")],
        ["prepare", str(record), "--output-dir", str(root / "prepared-cli")],
    ):
        result = subprocess.run(
            [sys.executable, "-m", "photo2sim.assemblies", *args], capture_output=True, text=True
        )
        assert result.returncode == 0, result.stderr
    assert (root / "prepared-cli/assembly.json").is_file()
    assert json.loads((root / "review.json").read_text())["format"].endswith("1.0")


def test_optional_step_import(tmp_path):
    import os
    import subprocess

    cad_python = os.environ.get("PHOTO2SIM_CAD_PYTHON")
    if not cad_python:
        pytest.skip("Set PHOTO2SIM_CAD_PYTHON to an isolated CadQuery interpreter")
    code = """
import cadquery as cq
from pathlib import Path
from photo2sim.assemblies.cad import import_step
root = Path(__import__('sys').argv[1])
a = cq.Assembly()
a.add(cq.Workplane().box(10,20,30), name='block', loc=cq.Location(cq.Vector(100,0,0)))
a.save(str(root/'source.step'))
r = import_step(root/'source.step', root/'parts')
assert len(r['parts']) == 1
p=r['parts'][0]
import numpy as np
assert np.allclose(p['bounds_m'][1], [.005,.01,.015])
assert np.allclose(p['pose']['position_m'], [.1,0,0])
assert p['source'] == 'sourced'
try: import_step(root/'source.step', root/'parts')
except FileExistsError: pass
else: raise AssertionError('overwrote prior import')
"""
    result = subprocess.run(
        [cad_python, "-c", code, str(tmp_path)],
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": str(__import__("pathlib").Path("src").resolve())},
    )
    assert result.returncode == 0, result.stderr


def test_stale_review_snapshot_rejected(project):
    from photo2sim.assemblies.review import review_snapshot

    Model, prepare, _ = functions()
    raw, root = project
    p = Model.model_validate(raw)
    p.review_snapshot = review_snapshot(p)
    p.groups[1].frame.position_m = (0.15, 0, 0.1)
    with pytest.raises(ValueError, match="changed|stale"):
        prepare(p, root, root / "stale")
    assert not (root / "stale").exists()
