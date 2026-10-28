"""Private child entrypoint for :mod:`photo2sim.api.mesh_import`."""

import argparse
import json
import sys
from pathlib import Path

MAX_OUTPUT_BYTES = 128 * 1024 * 1024


def _limits():
    """Linux production gets kernel-enforced native parser CPU/address ceilings."""
    if sys.platform != "linux":
        return
    import resource

    resource.setrlimit(resource.RLIMIT_CPU, (25, 25))
    resource.setrlimit(resource.RLIMIT_AS, (2 * 1024**3, 2 * 1024**3))


def _safe_root(value: str) -> Path:
    root = Path(value).resolve(strict=True)
    if not root.is_dir() or not (root / "request.json").is_file() or not (root / "input").is_dir():
        raise ValueError("invalid private import root")
    return root


def _uploads(root: Path, request: dict) -> dict[str, bytes]:
    result = {}
    for item in request.get("uploads", []):
        if not isinstance(item, dict) or not isinstance(item.get("name"), str):
            raise ValueError("invalid upload entry")
        stored = item.get("stored")
        if not isinstance(stored, str) or Path(stored).name != stored:
            raise ValueError("invalid private input name")
        path = (root / "input" / stored).resolve(strict=True)
        if not path.is_relative_to((root / "input").resolve()) or not path.is_file():
            raise ValueError("invalid private input path")
        result[item["name"]] = path.read_bytes()
    return result


def _from_meshes(root: Path, request: dict):
    from photo2sim.assemblies.draft import draft_from_meshes
    from photo2sim.assemblies.review import review_package

    uploads = _uploads(root, request)
    project, normalized = draft_from_meshes(
        request.get("name"), uploads, request.get("units"), request.get("synthetic")
    )
    source = root / "normalized"
    source.mkdir()
    for relative, data in normalized.items():
        destination = (source / relative).resolve()
        if not destination.is_relative_to(source.resolve()):
            raise ValueError("invalid normalized path")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    return {
        "project": project.model_dump(mode="json"),
        "normalized": {name: data.hex() for name, data in normalized.items()},
        "package": review_package(project, source),
    }


def _review_package(root: Path, request: dict):
    from photo2sim.assemblies.review import ReviewProject, review_package
    from photo2sim.contracts import bundle_path

    project = ReviewProject.model_validate(request.get("project"))
    uploads = _uploads(root, request)
    source = root / "source"
    source.mkdir()
    expected = {part.mesh for part in project.parts}
    if set(uploads) != expected:
        raise ValueError("source mesh set changed")
    for relative, data in uploads.items():
        destination = (source / bundle_path(relative)).resolve()
        if not destination.is_relative_to(source.resolve()):
            raise ValueError("invalid source path")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    return {"package": review_package(project, source)}


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    _limits()
    root = _safe_root(args.root)
    request = json.loads((root / "request.json").read_text(encoding="utf-8"))
    operation = request.get("operation")
    if operation == "from_meshes":
        result = _from_meshes(root, request)
    elif operation == "review_package":
        result = _review_package(root, request)
    else:
        raise ValueError("invalid operation")
    payload = json.dumps({"ok": True, **result}).encode("utf-8")
    if len(payload) > MAX_OUTPUT_BYTES:
        raise ValueError("preview output exceeds limit")
    (root / "result.json").write_bytes(payload)


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        # Details from native parsers may include local paths; the parent emits a stable rejection.
        raise SystemExit(1)
