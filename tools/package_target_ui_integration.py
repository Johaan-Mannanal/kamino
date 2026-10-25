"""Prepare the exact target/Workspace tree without touching the checkout index.

Run --prepare --source-stable only after final source and evidence are frozen.
After committing the printed tree, run --finalize <commit> to bind the bundle.
This tool never commits, pushes, checks out files, or downloads missing assets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import zipfile
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs" / "target-ui-integration"
BASE = "b61383f0c17d3f81ef72ffdbe9640da2e193bede"
CHECKPOINT = "724867cea2497a571002e6d0d9ac46d64b604c6f"
PORTABLE_UI = "9600d529756b9e7294d323c39230bdfb901fe46e"
INPUT_SHA256 = "94e8c90dac00020b74d542d706142a48b30b0c6af8bc835b44e8850564297cef"
INPUT_PATCH = OUT / "rigid-target-review-v2.patch"
PATCH = OUT / "combined-target-workspace.patch"
BUNDLE = OUT / "kamino-target-workspace-v2.zip"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(*args: str, index: Path | None = None) -> bytes:
    env = os.environ.copy()
    env["GIT_NO_LAZY_FETCH"] = "1"
    if index is not None:
        env["GIT_INDEX_FILE"] = str(index.resolve())
    return subprocess.check_output(
        ["git", "-c", "remote.origin.promisor=false", *args], cwd=ROOT, env=env
    )


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def intended_paths() -> list[str]:
    paths = {
        line.split("\t", 2)[2]
        for line in git("apply", "--numstat", str(INPUT_PATCH)).decode().splitlines()
    }
    prototype_paths = (
        git("diff", "--name-only", BASE, "--", "prototypes/kamino-ui").decode().splitlines()
    )
    prototype_paths += (
        git("ls-files", "--others", "--exclude-standard", "--", "prototypes/kamino-ui")
        .decode()
        .splitlines()
    )
    for path in prototype_paths:
        relative = Path(path).relative_to("prototypes/kamino-ui")
        if relative.parts[0] in {"src", "scripts"} or (
            len(relative.parts) == 1 and relative.suffix in {".md", ".json", ".mjs", ".yaml"}
        ):
            paths.add(path)
    paths.update(
        {
            "frontend/src/workflow.test.ts",
            "docs/handoffs/live-workspace-target-review-v2.md",
            "prototypes/kamino-ui/README.md",
            "tools/package_target_ui_integration.py",
        }
    )
    evidence = ROOT / "docs/evidence/target-ui-integration"
    paths.update(
        path.relative_to(ROOT).as_posix() for path in evidence.rglob("*") if path.is_file()
    )
    for path in paths:
        resolved = (ROOT / path).resolve()
        if not resolved.is_relative_to(ROOT) or not resolved.is_file():
            raise ValueError(f"Intended source path is unavailable or unsafe: {path}")
        if any(
            part in {"node_modules", ".git", ".pnpm-store", "dist", ".cache"}
            for part in Path(path).parts
        ):
            raise ValueError(f"Dependency/generated path must not enter delivery: {path}")
    return sorted(paths)


def index_entries(index: Path) -> dict[str, str]:
    entries = {}
    for entry in git("ls-files", "--stage", "-z", index=index).split(b"\0"):
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        _mode, blob, stage = metadata.split()
        if stage != b"0":
            raise ValueError("Prepared source index has unresolved entries")
        entries[name.decode()] = blob.decode()
    return entries


def source_payload(identity: dict) -> dict[str, bytes]:
    return {
        "source/" + path: git("cat-file", "blob", blob)
        for path, blob in identity["source_blob_ids"].items()
    }


def bundle(identity: dict) -> None:
    payload = source_payload(identity)
    for name in ("REPORT.md", "APPLY.md", "source-identity.json", "source-manifest.json"):
        payload[name] = (OUT / name).read_bytes()
    payload[PATCH.name] = PATCH.read_bytes()
    payload["input-delivery/" + INPUT_PATCH.name] = INPUT_PATCH.read_bytes()
    own_names = {
        "REPORT.md",
        "APPLY.md",
        "source-identity.json",
        "source-manifest.json",
        "packaging-verification.json",
        "SHA256SUMS.txt",
        BUNDLE.name,
    }
    # This folder contains synthetic acceptance evidence only. Never recurse into
    # its server/job directories or package dependencies/private investigation data.
    for path in OUT.iterdir():
        if (
            path.is_file()
            and path.name not in own_names
            and path.suffix in {".json", ".log", ".md", ".png", ".zip"}
        ):
            payload["evidence/" + path.name] = path.read_bytes()
    baseline = ROOT / "outputs/ui-integration/b61383f-baseline"
    for name in ("python-final-tests.log", "REPORT.md", "source-identity.json"):
        path = baseline / name
        if path.is_file():
            payload["baseline/" + name] = path.read_bytes()
    sums = "".join(f"{sha256(data)}  {name}\n" for name, data in sorted(payload.items()))
    payload["SHA256SUMS.txt"] = sums.encode()
    with zipfile.ZipFile(BUNDLE, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(payload.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(BUNDLE) as archive:
        if archive.testzip() is not None:
            raise ValueError("Delivery ZIP integrity check failed")
        for name, data in payload.items():
            if archive.read(name) != data:
                raise ValueError(f"Delivery ZIP byte verification failed: {name}")
    (OUT / "SHA256SUMS.txt").write_text(
        sums + f"{sha256(BUNDLE.read_bytes())}  {BUNDLE.name}\n", encoding="utf-8"
    )
    write_json(
        OUT / "packaging-verification.json",
        {
            "candidate_commit": identity.get("candidate_commit"),
            "candidate_tree": identity["candidate_tree"],
            "incremental_patch_sha256": sha256(PATCH.read_bytes()),
            "bundle_sha256": sha256(BUNDLE.read_bytes()),
            "bundle_bytes": BUNDLE.stat().st_size,
            "members": len(payload),
            "zip_byte_verification": True,
            "isolated_apply_verification": identity["isolated_apply_verification"],
        },
    )


def prepare() -> None:
    if git("rev-parse", "HEAD").decode().strip() != BASE:
        raise ValueError("Prepare must run at the exact b61383f integration baseline")
    if sha256(INPUT_PATCH.read_bytes()) != INPUT_SHA256:
        raise ValueError("The full input v2 patch has a different SHA-256")
    real_index = Path(git("rev-parse", "--git-path", "index").decode().strip())
    if not real_index.is_absolute():
        real_index = ROOT / real_index
    before = sha256(real_index.read_bytes()) if real_index.exists() else None
    prepared_index = OUT / "prepared-source.index"
    validation_index = OUT / "apply-validation.index"
    paths = intended_paths()
    git("read-tree", BASE, index=prepared_index)
    git("add", "--", *paths, index=prepared_index)
    tree = git("write-tree", "--missing-ok", index=prepared_index).decode().strip()
    patch = git("diff", "--cached", "--binary", "--full-index", BASE, "--", index=prepared_index)
    PATCH.write_bytes(patch)
    git("read-tree", BASE, index=validation_index)
    git("apply", "--cached", "--check", str(PATCH), index=validation_index)
    git("apply", "--cached", str(PATCH), index=validation_index)
    applied_tree = git("write-tree", "--missing-ok", index=validation_index).decode().strip()
    if applied_tree != tree:
        raise ValueError("Incremental patch did not reconstruct the prepared tree")
    blobs = index_entries(prepared_index)
    included = {path: blobs[path] for path in paths}
    manifest = []
    for path, blob in included.items():
        data = git("cat-file", "blob", blob)
        manifest.append(
            {"path": path, "git_blob_sha1": blob, "sha256": sha256(data), "bytes": len(data)}
        )
    write_json(
        OUT / "source-manifest.json",
        {
            "scope": "Explicit included source/evidence paths; bytes are canonical Git blobs",
            "files": manifest,
        },
    )
    after = sha256(real_index.read_bytes()) if real_index.exists() else None
    if before != after or git("rev-parse", "HEAD").decode().strip() != BASE:
        raise ValueError("Real Git index or HEAD changed during isolated packaging")
    identity = {
        "base_commit": BASE,
        "accepted_checkpoint": CHECKPOINT,
        "portable_ui_commit": PORTABLE_UI,
        "input_patch_sha256": INPUT_SHA256,
        "candidate_tree": tree,
        "candidate_commit": None,
        "prepared_at_utc": datetime.now(UTC).isoformat(),
        "incremental_patch_sha256": sha256(patch),
        "source_manifest_sha256": sha256((OUT / "source-manifest.json").read_bytes()),
        "source_blob_ids": included,
        "isolated_apply_verification": {
            "base_commit": BASE,
            "reconstructed_tree": applied_tree,
            "passed": True,
        },
        "real_index_sha256_before": before,
        "real_index_sha256_after": after,
        "real_index_unchanged": True,
        "excluded": [
            "unrelated CI edits",
            "missing inherited historical assets",
            "parked web/Fetch extras",
            "dependencies",
            "private outputs",
            "SESSION-HANDOFF document",
        ],
    }
    write_json(OUT / "source-identity.json", identity)
    (OUT / "prepared-tree.txt").write_text(tree + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "prepared_tree": tree,
                "included_paths": len(paths),
                "patch_sha256": sha256(patch),
                "real_index_unchanged": True,
                "bundle": "Created only by --finalize after final browser evidence and candidate commit",
            }
        )
    )


def finalize(commit: str) -> None:
    identity = json.loads((OUT / "source-identity.json").read_text(encoding="utf-8"))
    resolved = git("rev-parse", "--verify", commit + "^{commit}").decode().strip()
    tree = git("rev-parse", resolved + "^{tree}").decode().strip()
    if tree != identity["candidate_tree"]:
        raise ValueError("Candidate commit tree does not match the verified prepared source")
    if sha256(PATCH.read_bytes()) != identity["incremental_patch_sha256"]:
        raise ValueError("Incremental patch changed after preparation")
    identity["candidate_commit"] = resolved
    write_json(OUT / "source-identity.json", identity)
    bundle(identity)
    print(
        json.dumps(
            {
                "candidate_commit": resolved,
                "tree": tree,
                "bundle_sha256": sha256(BUNDLE.read_bytes()),
            }
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--prepare", action="store_true")
    action.add_argument("--finalize", metavar="COMMIT")
    parser.add_argument("--source-stable", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.prepare:
        if not args.source_stable:
            parser.error("--prepare requires the explicit --source-stable acknowledgement")
        prepare()
    else:
        finalize(args.finalize)


if __name__ == "__main__":
    main()
