"""Existing surface islands are selectable, never chosen automatically."""

import hashlib

import numpy as np
import pytest
import trimesh

from photo2sim.assets.target import geometry_context, inspect_target
from photo2sim.contracts import Orientation


def scene_file(tmp_path):
    scene = trimesh.Scene()
    for name, size, x in [
        ("small target", 0.5, -2),
        ("big distractor", 2, 2),
        ("other target part", 0.3, -1),
    ]:
        mesh = trimesh.creation.box(extents=[size] * 3)
        mesh.apply_translation([x, 0, 0])
        scene.add_geometry(mesh, node_name=name)
    path = tmp_path / "scene.glb"
    scene.export(path)
    return path


def test_inventory_is_source_bound_and_selection_preserves_multiple_parts(tmp_path):
    path = scene_file(tmp_path)
    original = path.read_bytes()
    target = inspect_target(path)
    inventory = target.inventory()
    assert inventory["source_mesh_sha256"] == hashlib.sha256(original).hexdigest()
    assert len(inventory["islands"]) == 3
    assert "selected_island_ids" not in inventory  # no automatic largest/all default
    small = [i for i in inventory["islands"] if i["bounds_input_units"][1][0] < 0]
    selected = target.select([i["id"] for i in small])
    assert len(selected.faces) == 24 and selected.extents[0] < 2
    assert len(target.mesh.faces) == 36
    assert inspect_target(path).inventory() == inventory
    assert path.read_bytes() == original
    with pytest.raises(ValueError):
        target.select([])
    with pytest.raises(ValueError):
        target.select(["f" * 64])
    with pytest.raises(ValueError):
        target.select([small[0]["id"]] * 2)
    context = geometry_context(
        inventory["source_mesh_sha256"], [i["id"] for i in small], Orientation()
    )
    assert context == geometry_context(
        inventory["source_mesh_sha256"], [i["id"] for i in reversed(small)], Orientation()
    )
    assert context != geometry_context(
        inventory["source_mesh_sha256"], [small[0]["id"]], Orientation()
    )
    assert context != geometry_context(
        inventory["source_mesh_sha256"], [i["id"] for i in small], Orientation(x_deg=90)
    )


def test_exact_seams_are_connected_without_welding_export_vertices(tmp_path):
    mesh = trimesh.creation.box()
    mesh.unmerge_vertices()
    path = tmp_path / "seams.glb"
    mesh.export(path)
    target = inspect_target(path)
    assert len(target.inventory()["islands"]) == 1
    selected = target.select([target.inventory()["islands"][0]["id"]])
    assert len(selected.faces) == len(mesh.faces)
    assert len(target.mesh.vertices) == len(mesh.vertices)


def test_nodes_remain_distinct_even_when_instanced_geometry_touches(tmp_path):
    mesh = trimesh.creation.box()
    scene = trimesh.Scene()
    scene.add_geometry(mesh, node_name="first", geom_name="shared")
    transform = np.eye(4)
    transform[0, 3] = 1
    scene.graph.update(
        frame_from=scene.graph.base_frame, frame_to="second", matrix=transform, geometry="shared"
    )
    path = tmp_path / "instances.glb"
    scene.export(path)
    target = inspect_target(path)
    assert len(target.inventory()["islands"]) == 2
    assert target.mesh.extents == pytest.approx([2, 1, 1])
    assert sum(i["face_count"] for i in target.inventory()["islands"]) == 24


def test_context_has_one_identity_for_equivalent_numeric_orientations():
    assert geometry_context("a" * 64, ["b" * 64], Orientation()) == geometry_context(
        "a" * 64, ["b" * 64], Orientation(x_deg=0.0, y_deg=-0.0, z_deg=0.0)
    )


def test_parser_errors_are_sanitized_as_invalid_source(tmp_path, monkeypatch):
    path = scene_file(tmp_path)

    def broken(*args, **kwargs):
        raise RuntimeError("private parser detail")

    monkeypatch.setattr(trimesh, "load", broken)
    with pytest.raises(ValueError, match="parse") as error:
        inspect_target(path)
    assert "private parser detail" not in str(error.value)
