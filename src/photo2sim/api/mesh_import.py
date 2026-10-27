"""Bounded subprocess boundary for untrusted local mesh parsing.

The child only receives uploaded bytes and cannot inherit provider credentials or
application settings.  It emits a reviewed browser package through a private
temporary directory; no input path supplied by a client is executed or opened.
"""

import json
import os
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

from photo2sim.assemblies.review import ReviewProject

MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_INPUT_BYTES = 64 * 1024 * 1024
MAX_OUTPUT_BYTES = 128 * 1024 * 1024
DEADLINE_SECONDS = 30
_PARSER_SLOTS = threading.BoundedSemaphore(2)


class MeshImportError(ValueError):
    """A user-visible rejection from the isolated importer."""


class MeshImportBusy(MeshImportError):
    """All bounded parser workers are currently occupied."""


def _child_environment() -> dict[str, str]:
    """Keep only process essentials and cap native-library thread fanout."""
    keep = {"PATH", "SYSTEMROOT", "WINDIR", "TMP", "TEMP", "LANG", "LC_ALL"}
    result = {key: value for key, value in os.environ.items() if key in keep and value}
    result.update(
        {
            "OMP_NUM_THREADS": "1",
            "OPENBLAS_NUM_THREADS": "1",
            "MKL_NUM_THREADS": "1",
            "NUMEXPR_NUM_THREADS": "1",
            "PYTHONNOUSERSITE": "1",
        }
    )
    return result


def _checked_uploads(uploads: dict[str, bytes]) -> dict[str, bytes]:
    if not uploads:
        raise MeshImportError("Select at least one component mesh")
    total = 0
    result = {}
    for name, data in uploads.items():
        if not isinstance(name, str) or not isinstance(data, bytes):
            raise MeshImportError("Mesh upload is invalid")
        if len(data) > MAX_FILE_BYTES:
            raise MeshImportError("Mesh upload limit exceeded")
        total += len(data)
        if total > MAX_INPUT_BYTES:
            raise MeshImportError("Mesh upload limit exceeded")
        result[name] = data
    return result


def _run(manifest: dict, uploads: dict[str, bytes]) -> dict:
    uploads = _checked_uploads(uploads)
    if not _PARSER_SLOTS.acquire(blocking=False):
        raise MeshImportBusy("Mesh import is busy; retry shortly")
    try:
        with tempfile.TemporaryDirectory(prefix="kamino-mesh-import-") as directory:
            root = Path(directory)
            input_dir = root / "input"
            input_dir.mkdir(mode=0o700)
            entries = []
            for index, (name, data) in enumerate(uploads.items()):
                stored = f"{index:04d}.mesh"
                (input_dir / stored).write_bytes(data)
                entries.append({"name": name, "stored": stored})
            manifest = {**manifest, "uploads": entries}
            (root / "request.json").write_text(json.dumps(manifest), encoding="utf-8")
            try:
                process = subprocess.run(
                    [sys.executable, "-m", "photo2sim.api.mesh_import_worker", "--root", str(root)],
                    cwd=root,
                    env=_child_environment(),
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=DEADLINE_SECONDS,
                    check=False,
                )
            except subprocess.TimeoutExpired as exc:
                raise MeshImportError("Mesh import exceeded the processing time limit") from exc
            output = root / "result.json"
            if process.returncode != 0 or not output.is_file():
                raise MeshImportError("Invalid geometry-only mesh")
            if output.stat().st_size > MAX_OUTPUT_BYTES:
                raise MeshImportError("Mesh preview exceeds the retained output limit")
            try:
                result = json.loads(output.read_bytes())
            except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise MeshImportError("Invalid geometry-only mesh") from exc
            if not isinstance(result, dict) or result.get("ok") is not True:
                raise MeshImportError("Invalid geometry-only mesh")
            return result
    finally:
        _PARSER_SLOTS.release()


def import_meshes(
    name: str, uploads: dict[str, bytes], units: str, synthetic: bool
) -> tuple[ReviewProject, dict[str, bytes], dict[str, bytes], dict]:
    """Normalize a new mesh import in a constrained child process."""
    originals = _checked_uploads(uploads)
    result = _run(
        {"operation": "from_meshes", "name": name, "units": units, "synthetic": synthetic},
        originals,
    )
    project = ReviewProject.model_validate(result.get("project"))
    normalized = result.get("normalized")
    package = result.get("package")
    if (
        not isinstance(normalized, dict)
        or not all(
            isinstance(key, str) and isinstance(value, str) for key, value in normalized.items()
        )
        or not isinstance(package, dict)
    ):
        raise MeshImportError("Invalid geometry-only mesh")
    try:
        decoded = {key: bytes.fromhex(value) for key, value in normalized.items()}
    except ValueError as exc:
        raise MeshImportError("Invalid geometry-only mesh") from exc
    # Normalized source must fit the same boundary used when reopening/reviewing it.
    decoded = _checked_uploads(decoded)
    return project, decoded, originals, package


def review_import(project: ReviewProject, uploads: dict[str, bytes]) -> dict:
    """Build a source-bound review package in the constrained child process."""
    result = _run(
        {"operation": "review_package", "project": project.model_dump(mode="json")}, uploads
    )
    package = result.get("package")
    if not isinstance(package, dict):
        raise MeshImportError("Invalid geometry-only mesh")
    return package
