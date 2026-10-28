import threading

import pytest


def tetrahedron():
    return b"\n".join(
        [
            b"v 0 0 0",
            b"v 1 0 0",
            b"v 0 1 0",
            b"v 0 0 1",
            b"f 1 2 3",
            b"f 1 2 4",
            b"f 1 3 4",
            b"f 2 3 4",
        ]
    )


def test_mesh_import_normalizes_in_a_fixed_child_process(monkeypatch):
    from photo2sim.api.mesh_import import import_meshes

    monkeypatch.setenv("MESHY_API_KEY", "must-not-reach-parser")
    project, normalized, originals, package = import_meshes(
        "part", {"part.obj": tetrahedron()}, "m", False
    )

    assert project.parts[0].mesh == "meshes/part_001.obj"
    assert set(normalized) == {"meshes/part_001.obj"}
    assert originals == {"part.obj": tetrahedron()}
    assert package["geometry"]["part_001"]["faces"]


def test_mesh_import_rejects_invalid_input_without_child_details():
    from photo2sim.api.mesh_import import MeshImportError, import_meshes

    with pytest.raises(MeshImportError, match="Invalid geometry-only mesh"):
        import_meshes("part", {"part.obj": b"not geometry"}, "m", False)


def test_review_package_rechecks_uploaded_source_hashes():
    from photo2sim.api.mesh_import import MeshImportError, import_meshes, review_import

    project, normalized, _, _ = import_meshes("part", {"part.obj": tetrahedron()}, "m", False)
    package = review_import(project, normalized)

    assert package["project"]["name"] == "part"
    with pytest.raises(MeshImportError, match="Invalid geometry-only mesh"):
        review_import(project, {"meshes/part_001.obj": tetrahedron()})


def test_mesh_import_rejects_oversized_input_before_starting_native_parser():
    from photo2sim.api.mesh_import import MeshImportError, import_meshes

    with pytest.raises(MeshImportError, match="Mesh upload limit exceeded"):
        import_meshes("part", {"part.obj": b"x" * (32 * 1024 * 1024 + 1)}, "m", False)


def test_mesh_import_timeout_releases_the_parser_slot(monkeypatch):
    import photo2sim.api.mesh_import as importer

    monkeypatch.setattr(importer, "DEADLINE_SECONDS", 0.001)
    with pytest.raises(importer.MeshImportError, match="processing time limit"):
        importer.import_meshes("part", {"part.obj": tetrahedron()}, "m", False)

    monkeypatch.setattr(importer, "DEADLINE_SECONDS", 30)
    project, _, _, _ = importer.import_meshes("part", {"part.obj": tetrahedron()}, "m", False)
    assert project.name == "part"


def test_mesh_import_rejects_when_parser_slots_are_exhausted(monkeypatch):
    import photo2sim.api.mesh_import as importer

    monkeypatch.setattr(importer, "_PARSER_SLOTS", threading.BoundedSemaphore(0))
    monkeypatch.setattr(importer.subprocess, "run", lambda *args, **kwargs: pytest.fail("started"))

    with pytest.raises(importer.MeshImportBusy, match="busy"):
        importer.import_meshes("part", {"part.obj": tetrahedron()}, "m", False)


@pytest.mark.parametrize(
    "filename,data",
    [
        ("../outside.obj", tetrahedron()),
        ("part.obj", b"mtllib external.mtl\n" + tetrahedron()),
    ],
)
def test_mesh_import_rejects_external_paths_and_material_references(filename, data):
    from photo2sim.api.mesh_import import MeshImportError, import_meshes

    with pytest.raises(MeshImportError, match="Invalid geometry-only mesh"):
        import_meshes("part", {filename: data}, "m", False)


def test_mesh_import_child_environment_strips_provider_credentials(monkeypatch):
    from photo2sim.api.mesh_import import _child_environment

    monkeypatch.setenv("MESHY_API_KEY", "secret")
    monkeypatch.setenv("GEMINI_API_KEY", "secret")
    environment = _child_environment()

    assert "MESHY_API_KEY" not in environment
    assert "GEMINI_API_KEY" not in environment
    assert environment["OPENBLAS_NUM_THREADS"] == "1"
    assert environment["OMP_NUM_THREADS"] == "1"


def test_normalized_sources_must_fit_the_reopen_review_boundary(monkeypatch):
    from photo2sim.api import mesh_import

    # A compact source can expand when normalized. Do not publish a job that
    # would then be rejected by the identical input cap on a subsequent review.
    monkeypatch.setattr(mesh_import, "MAX_FILE_BYTES", len(tetrahedron()) + 1)
    with pytest.raises(mesh_import.MeshImportError, match="Mesh upload limit exceeded"):
        mesh_import.import_meshes("part", {"part.obj": tetrahedron()}, "m", False)
