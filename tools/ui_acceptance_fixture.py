"""Import the pinned original can evidence into a fresh offline acceptance job.

Run with ``python -m tools.ui_acceptance_fixture --archive PATH --data-dir PATH``.
Only original uploads and raw reconstruction are copied. No manual derivative,
provider task, saved sizing, or reviewed selection is imported.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from photo2sim.api.store import JobStore
from photo2sim.contracts import JobRecord

ARCHIVE_SHA256 = "e828bb548dae9e5828a29689f2e91c96f4069ee4c6aa8b5788a5700d2d01db6d"
MESH_SHA256 = "5b9ced8ce875c19b18abd171ce328959a443e6eb3103a21202f94280081bf6ec"
RECEIPT = "offline-can-fixture.json"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_original_can_fixture(store: JobStore, job: JobRecord) -> bool:
    root = store.job_dir(job.id)
    try:
        receipt = json.loads((root / RECEIPT).read_text(encoding="utf-8"))
        return (
            not job.synthetic
            and job.provider == "meshy"
            and job.mesh_path == "reconstruction/mesh.glb"
            and receipt["job_id"] == str(job.id)
            and receipt["archive_sha256"] == ARCHIVE_SHA256
            and sha256((root / job.mesh_path).read_bytes()) == MESH_SHA256
        )
    except (OSError, ValueError, KeyError, TypeError):
        return False


def import_can(settings, archive: Path, *, job_id: UUID | None = None) -> JobRecord:
    from tools.ui_acceptance_server import isolated_data_dir

    isolated_data_dir(settings.data_dir)
    raw = archive.read_bytes()
    if sha256(raw) != ARCHIVE_SHA256:
        raise ValueError("Original can archive checksum mismatch")
    names = ["reconstruction/mesh.glb", *[f"uploads/{i:02}.jpg" for i in range(3)]]
    with zipfile.ZipFile(archive) as bundle:
        manifest = json.loads(bundle.read("MANIFEST.json"))
        # Check every payload without extracting or executing archive scripts.
        for item in manifest["files"]:
            data = bundle.read(item["path"])
            if len(data) != item["bytes"] or sha256(data) != item["sha256"]:
                raise ValueError(f"Manifest mismatch: {item['path']}")
        payload = {name: bundle.read(f"original/{name}") for name in names}
    if sha256(payload["reconstruction/mesh.glb"]) != MESH_SHA256:
        raise ValueError("Original can mesh checksum mismatch")
    store = JobStore(settings.data_dir)
    ident = job_id or uuid4()
    root = store.job_dir(ident)
    # Check database as well as directory; never overwrite an existing job.
    try:
        store.get(ident)
    except KeyError:
        pass
    else:
        raise FileExistsError(f"Job already exists: {ident}")
    root.mkdir(exist_ok=False)
    now = datetime.now(UTC)
    job = JobRecord(
        id=ident,
        status="awaiting_properties",
        provider="meshy",
        synthetic=False,
        created_at=now,
        updated_at=now,
        progress=100,
        source_images=names[1:],
        mesh_path=names[0],
        legacy_sizing_allowed=False,
    )
    try:
        for name, data in payload.items():
            destination = root / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
        receipt = {
            "job_id": str(ident),
            "archive_sha256": ARCHIVE_SHA256,
            "mesh_sha256": MESH_SHA256,
            "manifest_payloads_verified": len(manifest["files"]),
            "offline_cached_reconstruction": True,
            "physical_measurements": False,
            "source_images": {name: sha256(payload[name]) for name in names[1:]},
        }
        (root / RECEIPT).write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        store.create(job)
    except Exception:
        shutil.rmtree(root)
        raise
    return job


def main():
    from tools.ui_acceptance_server import DEFAULT_DATA_DIR, acceptance_settings

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    args = parser.parse_args()
    job = import_can(acceptance_settings(args.data_dir, "ui-acceptance-only"), args.archive)
    print(
        json.dumps(
            {
                "job_id": str(job.id),
                "status": job.status,
                "archive_sha256": ARCHIVE_SHA256,
                "provider_calls": 0,
            }
        )
    )


if __name__ == "__main__":
    main()
