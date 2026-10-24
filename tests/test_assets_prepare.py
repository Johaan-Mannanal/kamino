"""Adversarial checks for the geometry boundary using only synthetic local meshes."""

import re
import shutil
from contextlib import suppress
from pathlib import PurePosixPath
from uuid import UUID

import numpy as np
import pytest
import trimesh
from PIL import Image

from photo2sim.assets.prepare import prepare_asset
from photo2sim.contracts import AssetProperties, AssetRecord, CollisionGeometry


@pytest.fixture
def properties():
    return AssetProperties.model_validate(
        {
            "dimensions_m": {
                "x": 0.047,
                "y": 0.083,
                "z": 0.129,
                "source": "measured",
                "note": "Full extents measured with calipers; keep this provenance.",
            },
            "mass_kg": {
                "value": 0.37,
                "source": "user_supplied",
                "note": "Operator's scale reading, not inferred from geometry.",
            },
            "sliding_friction": None,
        }
    )


def write_box(path):
    mesh = trimesh.creation.box(extents=[2.0, 3.0, 4.0])
    mesh.apply_translation([19.0, -7.0, 31.0])
    mesh.export(path)
    return path


def load_bundle_mesh(output_dir, record):
    relative = PurePosixPath(record.visual_mesh)
    assert not relative.is_absolute()
    assert "\\" not in record.visual_mesh
    assert ":" not in record.visual_mesh
    assert all(part not in {"", ".", ".."} for part in record.visual_mesh.split("/"))
    path = output_dir.joinpath(*relative.parts)
    assert path.resolve().is_relative_to(output_dir.resolve())
    assert path.is_file()

    scene = trimesh.load(path, force="scene", process=False)
    assert isinstance(scene, trimesh.Scene)
    assert scene.graph.nodes_geometry
    meshes = []
    for node in scene.graph.nodes_geometry:
        transform, geometry_name = scene.graph[node]
        np.testing.assert_allclose(transform, np.eye(4), atol=1e-6, rtol=0)
        mesh = scene.geometry[geometry_name]
        assert isinstance(mesh, trimesh.Trimesh)
        assert len(mesh.vertices) > 0
        assert len(mesh.faces) > 0
        assert np.isfinite(mesh.vertices).all()
        meshes.append(mesh)
    return trimesh.util.concatenate(meshes)


def assert_dimensions(mesh, properties):
    dimensions = properties.dimensions_m
    np.testing.assert_allclose(
        mesh.extents, [dimensions.x, dimensions.y, dimensions.z], atol=1e-6, rtol=0
    )
    np.testing.assert_allclose(mesh.bounds.mean(axis=0), np.zeros(3), atol=1e-6, rtol=0)


def assert_no_partial_bundle(output_dir):
    assert not output_dir.exists() or (output_dir.is_dir() and not any(output_dir.iterdir()))


def assert_rejected(mesh_path, output_dir, properties, message_pattern):
    before = mesh_path.read_bytes() if mesh_path.exists() else None
    with pytest.raises(ValueError) as error:
        prepare_asset(mesh_path, output_dir, properties)
    message = str(error.value).strip()
    assert len(message) >= 8, "Rejections must explain what is wrong with the input"
    assert re.search(message_pattern, message, re.IGNORECASE), message
    if before is not None:
        assert mesh_path.is_file()
        assert mesh_path.read_bytes() == before
    else:
        assert not mesh_path.exists()
    assert_no_partial_bundle(output_dir)


@pytest.mark.parametrize("extension", ["obj", "glb"])
@pytest.mark.parametrize("friction", [None, 0.0, 0.42])
def test_prepares_centred_portable_metre_mesh_and_preserves_provenance(
    tmp_path, properties, extension, friction
):
    if friction is not None:
        data = properties.model_dump()
        data["sliding_friction"] = {
            "value": friction,
            "source": "sourced",
            "note": "Measured for this contacting surface pair.",
        }
        properties = AssetProperties.model_validate(data)
    original_properties = properties.model_dump(mode="json")
    source = write_box(tmp_path / f"reconstruction.{extension}")
    original_bytes = source.read_bytes()
    output_dir = tmp_path / "bundle"

    record = prepare_asset(source, output_dir, properties)

    assert isinstance(record, AssetRecord)
    assert isinstance(record.asset_id, UUID)
    assert record.synthetic is False
    assert record.collision == CollisionGeometry(kind="box")
    assert record.collision.mesh_path is None
    assert record.properties == properties
    assert record.properties.model_dump(mode="json") == original_properties
    assert properties.model_dump(mode="json") == original_properties
    assert isinstance(record.notes, list)
    assert record.notes
    assert all(isinstance(note, str) and note.strip() for note in record.notes)
    notes = " ".join(record.notes).lower()
    assert re.search(r"orient|upright|axes|axis", notes), notes
    assert re.search(r"non[ -]?uniform|anisotrop|distort|per[ -]axis|independent", notes), notes
    # The boundary specifies no orientation algorithm or exact note wording.
    mesh = load_bundle_mesh(output_dir, record)
    assert_dimensions(mesh, properties)
    assert source.is_file()
    assert source.read_bytes() == original_bytes

    relocated = tmp_path / "relocated" / "bundle"
    shutil.copytree(output_dir, relocated)
    # Remove the original bundle so absolute references cannot accidentally work.
    shutil.rmtree(output_dir)
    reloaded = load_bundle_mesh(relocated, record)
    assert_dimensions(reloaded, properties)
    np.testing.assert_allclose(reloaded.extents, mesh.extents, atol=1e-6, rtol=0)
    assert source.read_bytes() == original_bytes


def component_volumes_and_centres(mesh):
    """Find face components without optional scipy/networkx dependencies."""
    # Weld export-created duplicate vertices before finding connected components.
    mesh = mesh.copy()
    mesh.merge_vertices()
    parents = list(range(len(mesh.vertices)))

    def root(vertex):
        while parents[vertex] != vertex:
            vertex = parents[vertex]
        return vertex

    for face in mesh.faces:
        for vertex in face[1:]:
            parents[root(vertex)] = root(face[0])
    groups = {}
    for index, face in enumerate(mesh.faces):
        groups.setdefault(root(face[0]), []).append(index)
    components = []
    for indices in groups.values():
        component = trimesh.Trimesh(
            vertices=mesh.vertices, faces=mesh.faces[indices], process=False
        )
        volume = abs(component.volume)
        vertices = np.unique(mesh.faces[indices])
        components.append((volume, mesh.vertices[vertices].mean(axis=0)))
    return sorted(components, key=lambda component: component[0])


def test_glb_scene_node_translation_and_nonuniform_scale_are_baked_in(tmp_path, properties):
    scene = trimesh.Scene()
    box = trimesh.creation.box(extents=[2.0, 3.0, 4.0])
    scene.add_geometry(box, node_name="reference", geom_name="reference_mesh")
    transform = trimesh.transformations.rotation_matrix(np.pi / 2, [0, 0, 1])
    transform[:3, :3] = transform[:3, :3] @ np.diag([2.0, 3.0, 1.0])
    transform[:3, 3] = [17.0, -11.0, 8.0]
    scene.add_geometry(
        box.copy(), node_name="transformed", geom_name="scaled_mesh", transform=transform
    )
    source = tmp_path / "transformed_scene.glb"
    scene.export(source)
    original_bytes = source.read_bytes()
    loaded_source = trimesh.load(source, force="scene", process=False)
    assert any(
        not np.allclose(loaded_source.graph[node][0], np.eye(4))
        for node in loaded_source.graph.nodes_geometry
    )
    output_dir = tmp_path / "bundle"

    record = prepare_asset(source, output_dir, properties)

    mesh = load_bundle_mesh(output_dir, record)
    assert_dimensions(mesh, properties)
    components = component_volumes_and_centres(mesh)
    assert len(components) == 2
    small, large = components
    assert small[0] > 0
    # Global orientation/scaling preserves volume ratios. Ignoring the node scale
    # yields 1 instead of 6, even if final aggregate extents look correct.
    assert large[0] / small[0] == pytest.approx(6.0, rel=1e-5)
    # Ignoring node translation leaves both components concentric.
    assert np.linalg.norm(large[1] - small[1]) > 1e-6
    assert source.is_file()
    assert source.read_bytes() == original_bytes


def test_same_input_can_be_prepared_into_two_output_directories(tmp_path, properties):
    source = write_box(tmp_path / "source.obj")
    original_bytes = source.read_bytes()
    records = []
    for name in ("first", "second"):
        output_dir = tmp_path / name
        record = prepare_asset(source, output_dir, properties)
        assert_dimensions(load_bundle_mesh(output_dir, record), properties)
        records.append(record)
        assert source.read_bytes() == original_bytes
    assert all(isinstance(record.asset_id, UUID) for record in records)
    # UUID uniqueness/reuse policy across calls is not specified.


def test_nonempty_output_directory_does_not_overwrite_or_delete_input(tmp_path, properties):
    output_dir = tmp_path / "existing"
    output_dir.mkdir()
    source = write_box(output_dir / "visual.obj")
    original_bytes = source.read_bytes()
    # Acceptance and exception type for nonempty output directories are unspecified;
    # only input preservation is asserted, including when input is in output_dir.
    with suppress(Exception):
        prepare_asset(source, output_dir, properties)
    assert source.is_file()
    assert source.read_bytes() == original_bytes


def test_missing_input_is_rejected_without_partial_bundle(tmp_path, properties):
    assert_rejected(
        tmp_path / "missing.obj",
        tmp_path / "bundle",
        properties,
        r"missing|not.found|does.not.exist|no.such|exist",
    )


@pytest.mark.parametrize("extension", ["txt", "xyz"])
def test_unsupported_extension_is_rejected_without_partial_bundle(tmp_path, properties, extension):
    source = tmp_path / f"mesh.{extension}"
    source.write_bytes(trimesh.creation.box().export(file_type="obj").encode())
    assert_rejected(
        source, tmp_path / "bundle", properties, r"unsupported|extension|format|obj|glb"
    )


@pytest.mark.parametrize("extension", ["obj", "glb"])
def test_empty_input_is_rejected_without_partial_bundle(tmp_path, properties, extension):
    source = tmp_path / f"empty.{extension}"
    source.write_bytes(b"")
    assert_rejected(
        source, tmp_path / "bundle", properties, r"empty|load|parse|invalid|mesh|geometry|glb"
    )


@pytest.mark.parametrize("extension", ["obj", "glb"])
def test_garbage_input_is_rejected_without_partial_bundle(tmp_path, properties, extension):
    source = tmp_path / f"garbage.{extension}"
    source.write_bytes(b"\xff\x00not a mesh\x80\x00\x01\n")
    assert_rejected(
        source, tmp_path / "bundle", properties, r"load|parse|invalid|mesh|geometry|decode|glb"
    )


def test_mesh_without_faces_is_rejected_without_partial_bundle(tmp_path, properties):
    mesh = trimesh.Trimesh(
        vertices=[[0, 0, 0], [1, 0, 0], [0, 1, 1], [1, 1, 0]],
        faces=np.empty((0, 3), dtype=int),
        process=False,
    )
    source = tmp_path / "no_faces.obj"
    mesh.export(source)
    assert_rejected(source, tmp_path / "bundle", properties, r"face|triangle|empty|mesh|geometry")


@pytest.mark.parametrize("shape", ["coincident", "collinear", "planar"])
def test_degenerate_mesh_is_rejected_without_partial_bundle(tmp_path, properties, shape):
    vertices = {
        "coincident": [[5, 5, 5], [5, 5, 5], [5, 5, 5]],
        "collinear": [[1, 1, 1], [2, 2, 2], [3, 3, 3]],
        "planar": [[0, 0, 7], [2, 0, 7], [0, 3, 7]],
    }[shape]
    mesh = trimesh.Trimesh(vertices=vertices, faces=[[0, 1, 2]], process=False)
    source = tmp_path / f"{shape}.obj"
    mesh.export(source)
    assert_rejected(
        source,
        tmp_path / "bundle",
        properties,
        r"degenerate|zero|extent|dimension|volume|area|face|mesh|geometry",
    )


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
def test_nonfinite_vertices_are_rejected_without_partial_bundle(tmp_path, properties, value):
    mesh = trimesh.creation.box()
    mesh.vertices[0, 0] = value
    source = tmp_path / "nonfinite.obj"
    mesh.export(source)
    assert_rejected(
        source,
        tmp_path / "bundle",
        properties,
        r"finite|nan|inf|invalid|vertex|vertices|mesh|geometry",
    )


def test_invalid_face_indices_are_rejected_cleanly(tmp_path, properties):
    source = tmp_path / "invalid_faces.obj"
    source.write_text("v 0 0 0\nv 1 1 1\nv 2 0 1\nf 1 2 99\n")
    assert_rejected(source, tmp_path / "bundle", properties, r"invalid|parse|vertex|indices")


def test_export_failure_removes_staging_and_preserves_empty_output(
    tmp_path, properties, monkeypatch
):
    source = write_box(tmp_path / "source.obj")
    output = tmp_path / "bundle"
    output.mkdir()

    def broken_export(mesh, path, **kwargs):
        path.write_text("partial export")
        raise OSError("simulated disk failure")

    monkeypatch.setattr(trimesh.Trimesh, "export", broken_export)
    assert_rejected(source, output, properties, r"write|disk")
    assert not list(tmp_path.glob(".photo2sim-prepare-*"))


def test_textured_obj_bundle_preserves_texture_after_source_is_removed(tmp_path, properties):
    source_dir = tmp_path / "source"
    source_dir.mkdir()
    source = source_dir / "textured.obj"
    mesh = trimesh.creation.box()
    mesh.visual = trimesh.visual.texture.TextureVisuals(
        uv=np.zeros((len(mesh.vertices), 2)),
        image=Image.new("RGB", (2, 2), (23, 97, 181)),
    )
    mesh.export(source)
    before = {p.name: p.read_bytes() for p in source_dir.iterdir()}
    output = tmp_path / "bundle"
    record = prepare_asset(source, output, properties)
    assert before == {p.name: p.read_bytes() for p in source_dir.iterdir()}
    relocated = tmp_path / "relocated"
    shutil.copytree(output, relocated)
    shutil.rmtree(source_dir)
    shutil.rmtree(output)
    visual = trimesh.load(relocated / record.visual_mesh, force="mesh", process=False)
    assert_dimensions(visual, properties)
    assert visual.visual.kind == "texture"
    assert visual.visual.material.image.getpixel((0, 0))[:3] == (23, 97, 181)


def test_subnanometre_dimensions_survive_obj_serialization(tmp_path, properties):
    data = properties.model_dump()
    data["dimensions_m"].update(x=1e-10, y=2e-10, z=3e-10)
    properties = AssetProperties.model_validate(data)
    source = write_box(tmp_path / "source.obj")
    output = tmp_path / "bundle"
    record = prepare_asset(source, output, properties)
    mesh = load_bundle_mesh(output, record)
    np.testing.assert_allclose(mesh.extents, [1e-10, 2e-10, 3e-10], rtol=1e-6, atol=0)
