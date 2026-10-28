from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from photo2sim.api.storage import StorageBudget, StorageLimitError


def budget(root: Path, *, total: int = 64, job: int = 48) -> StorageBudget:
    return StorageBudget(root, max_total_bytes=total, max_job_bytes=job, min_free_bytes=0)


def test_concurrent_admissions_cannot_reserve_more_than_global_budget(tmp_path):
    """Removing the lock would let both 40-byte writers pass the 64-byte limit."""
    storage = budget(tmp_path)
    job_root = tmp_path / "job"
    job_root.mkdir()

    def write(index: int) -> str:
        try:
            with storage.write_admission(job_root, 40):
                (job_root / f"{index}.bin").write_bytes(b"x" * 40)
            return "written"
        except StorageLimitError:
            return "rejected"

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(write, range(2)))

    assert sorted(outcomes) == ["rejected", "written"]
    assert sum(path.stat().st_size for path in job_root.iterdir()) == 40


def test_oversized_legacy_data_remains_readable_but_blocks_new_writes(tmp_path):
    job_root = tmp_path / "legacy"
    job_root.mkdir()
    retained = job_root / "paid-input.bin"
    retained.write_bytes(b"r" * 80)
    storage = budget(tmp_path)

    assert retained.read_bytes() == b"r" * 80
    with pytest.raises(StorageLimitError, match="storage budget"):
        with storage.write_admission(job_root, 1):
            pass
    assert retained.read_bytes() == b"r" * 80


def test_rejected_publication_leaves_existing_artifacts_unchanged(tmp_path):
    storage = budget(tmp_path, total=40, job=40)
    job_root = tmp_path / "job"
    previous = job_root / "attempts" / "old"
    previous.mkdir(parents=True)
    (previous / "evidence.txt").write_bytes(b"prior evidence")
    staged = tmp_path.parent / "staged-output"
    staged.mkdir()
    (staged / "scene.xml").write_bytes(b"x" * 32)
    destination = job_root / "attempts" / "new"

    with pytest.raises(StorageLimitError, match="storage budget"):
        storage.publish_directory(staged, destination, job_root)

    assert (previous / "evidence.txt").read_bytes() == b"prior evidence"
    assert not destination.exists()
    assert (staged / "scene.xml").read_bytes() == b"x" * 32


def test_publish_directory_is_atomic_and_never_overwrites_attempt(tmp_path):
    storage = budget(tmp_path, total=128, job=128)
    job_root = tmp_path / "job"
    job_root.mkdir()
    staged = tmp_path.parent / "staged-attempt"
    staged.mkdir()
    (staged / "scene.xml").write_text("<mujoco />", encoding="utf-8")
    destination = job_root / "attempts" / "attempt-1"

    storage.publish_directory(staged, destination, job_root)

    assert not staged.exists()
    assert (destination / "scene.xml").read_text(encoding="utf-8") == "<mujoco />"
    with pytest.raises(FileExistsError):
        storage.publish_directory(destination, destination, job_root)


def test_same_job_staging_is_not_counted_twice_at_publication(tmp_path):
    storage = budget(tmp_path, total=64, job=48)
    job_root = tmp_path / "job"
    staged = job_root / ".pending" / "artifact"
    staged.mkdir(parents=True)
    (staged / "scene.xml").write_bytes(b"x" * 40)
    destination = job_root / "attempts" / "one"
    storage.publish_directory(staged, destination, job_root)
    assert (destination / "scene.xml").read_bytes() == b"x" * 40


def test_mock_download_can_use_owned_jobs_under_read_only_mount_parent(tmp_path):
    import os
    from uuid import UUID

    from fastapi.testclient import TestClient
    from test_api import upload, wait_for

    from photo2sim.api.app import create_app
    from photo2sim.api.config import Settings
    from photo2sim.api.store import JobStore

    if os.name == "nt" or (hasattr(os, "geteuid") and os.geteuid() == 0):
        pytest.skip("Requires POSIX permission enforcement for a non-root user")
    mount = tmp_path / "root-owned-mount"
    data = mount / "jobs"
    data.mkdir(parents=True)
    mount.chmod(0o555)
    try:
        with TestClient(create_app(Settings(data_dir=data))) as client:
            ident = UUID(upload(client).json()["id"])
            job = wait_for(client, ident, "awaiting_properties")
            assert client.get(f"/api/jobs/{ident}/files/{job['mesh_path']}").status_code == 200
            assert not list(JobStore(data).job_dir(ident).glob("photo2sim-download-*"))
    finally:
        mount.chmod(0o755)


@pytest.mark.parametrize("kind", ["rigid", "assembly"])
def test_exports_use_owned_job_scratch_under_read_only_mount_parent(tmp_path, kind):
    import os

    from fastapi.testclient import TestClient

    from photo2sim.api.app import create_app
    from photo2sim.api.config import Settings

    if os.name == "nt" or (hasattr(os, "geteuid") and os.geteuid() == 0):
        pytest.skip("Requires POSIX permission enforcement for a non-root user")
    mount = tmp_path / "mount"
    data = mount / "jobs"
    data.mkdir(parents=True)
    mount.chmod(0o555)
    try:
        if kind == "rigid":
            from test_pipeline import seed_job, terminal

            ident, _ = seed_job(data)
            with TestClient(create_app(Settings(data_dir=data))) as client:
                assert client.post(f"/api/jobs/{ident}/process").status_code == 202
                job = terminal(client, ident)
                assert job["status"] == "completed", job
                assert (
                    client.get(f"/api/jobs/{ident}/files/{job['bundle_path']}").status_code == 200
                )
        else:
            from test_assembly_jobs_api import finished, upload

            with TestClient(create_app(Settings(data_dir=data))) as client:
                job = upload(client).json()
                base = f"/api/assembly-jobs/{job['id']}"
                assert (
                    client.post(base + "/process", json={"expected_revision": 1}).status_code == 202
                )
                job = finished(client, job["id"])
                assert job["status"] == "completed", job
                assert client.get(base + "/files/" + job["bundle_path"]).status_code == 200
    finally:
        mount.chmod(0o755)
