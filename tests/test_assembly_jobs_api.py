"""HTTP workflow using the repository's synthetic two-link source meshes."""

import hashlib
import io
import json
import os
import time
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings

FIXTURE = Path(__file__).resolve().parents[1] / "examples/assemblies/two-link-hinge/input"


def project():
    source = json.loads((FIXTURE / "assembly.json").read_text())
    root = source["root_pose"]
    arm = {"position_m": [0, 0, 0.31], "quaternion_wxyz": [1, 0, 0, 0]}
    parts = []
    groups = []
    for link, pose in zip(source["links"], [root, arm]):
        path = link["visual_mesh"]
        parts.append(
            {
                "id": link["name"],
                "mesh": path,
                "sha256": hashlib.sha256((FIXTURE / path).read_bytes()).hexdigest(),
                "pose": pose,
                "source": link["geometry_source"],
                "note": link["geometry_note"],
                "group": link["name"],
            }
        )
        groups.append(
            {
                "name": link["name"],
                "frame": pose,
                "mass_kg": link["mass_kg"],
                "sliding_friction": link["sliding_friction"],
                "reviewed": True,
                "review_note": "Synthetic fixture review",
            }
        )
    joint = source["joints"][0]
    joint["origin"] = {"position_m": [0, 0, 0], "quaternion_wxyz": [1, 0, 0, 0]}
    joint.update(reviewed=True, review_note="Synthetic hinge review")
    result = {
        "name": source["name"],
        "synthetic": True,
        "root_link": source["root_link"],
        "parts": parts,
        "groups": groups,
        "joints": [joint],
        "notes": ["Synthetic fixture"],
    }
    from photo2sim.assemblies.review import ReviewProject, review_snapshot

    parsed = ReviewProject.model_validate(result)
    parsed.review_snapshot = review_snapshot(parsed)
    return parsed.model_dump(mode="json")


def upload(client, data=None):
    raw = data or project()
    files = [("project", ("project.json", json.dumps(raw), "application/json"))]
    for path in {part["mesh"] for part in raw["parts"]}:
        files.append(("meshes", (path, (FIXTURE / path).read_bytes(), "application/octet-stream")))
    return client.post("/api/assembly-jobs", files=files)


def finished(client, job_id):
    for _ in range(100):
        job = client.get(f"/api/assembly-jobs/{job_id}").json()
        if job["status"] in {"completed", "failed"}:
            return job
        time.sleep(0.1)
    raise AssertionError("Assembly processing timed out")


def test_two_link_import_revision_process_and_download(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        response = upload(client)
        assert response.status_code == 202, response.text
        job = response.json()
        job_id = job["id"]
        package = client.get(f"/api/assembly-jobs/{job_id}/files/{job['package_path']}").json()
        assert package["project"]["parts"][0]["sha256"] == project()["parts"][0]["sha256"]
        assert len(package["geometry"]) == 2
        revised = project()
        revised["notes"].append("Second saved revision")
        from photo2sim.assemblies.review import ReviewProject, review_snapshot

        parsed = ReviewProject.model_validate(revised)
        parsed.review_snapshot = review_snapshot(parsed)
        response = client.put(
            f"/api/assembly-jobs/{job_id}/revisions",
            json={"project": parsed.model_dump(mode="json"), "expected_revision": 1},
        )
        assert response.status_code == 201, response.text
        assert response.json()["revision"] == 2
        assert (
            client.post(
                f"/api/assembly-jobs/{job_id}/process", json={"expected_revision": 1}
            ).status_code
            == 409
        )
        response = client.post(
            f"/api/assembly-jobs/{job_id}/process", json={"expected_revision": 2}
        )
        assert response.status_code == 202, response.text
        job = finished(client, job_id)
        assert job["status"] == "completed", job.get("error")
        assert job["export_generated"] is True
        assert job["motion_validation_passed"] is True
        assert len(job["attempts"]) == 1
        archive = client.get(f"/api/assembly-jobs/{job_id}/files/{job['bundle_path']}")
        assert archive.status_code == 200
        with zipfile.ZipFile(io.BytesIO(archive.content)) as zipped:
            assert {
                "scene.xml",
                "validation.json",
                "prepared/review-project.json",
                "sources/meshes/base.obj",
                "sources/meshes/arm.obj",
            } <= set(zipped.namelist())
            assert json.loads(zipped.read("validation.json"))["passed"] is True
            simulation = json.loads(zipped.read("simulation.json"))
            assert simulation["collision_mode"] == "box"
            assert simulation["exclude_joint_pairs"] is False


def test_hash_auth_and_failed_validation_retained(tmp_path, monkeypatch):
    from photo2sim.api import assembly_jobs

    token = "private-test-token"
    with TestClient(create_app(Settings(data_dir=tmp_path, api_token=token))) as client:
        assert upload(client).status_code == 401
        client.headers["Authorization"] = f"Bearer {token}"
        bad = project()
        bad["parts"][0]["sha256"] = "0" * 64
        assert upload(client, bad).status_code == 422
        job = upload(client).json()
        job_id = job["id"]
        assert client.get(f"/api/assembly-jobs/{job_id}/files/../job.json").status_code == 404
        monkeypatch.setattr(
            assembly_jobs,
            "validate_assembly",
            lambda scene: {"passed": False, "reason": "fixture failure"},
        )
        assert (
            client.post(
                f"/api/assembly-jobs/{job_id}/process", json={"expected_revision": 1}
            ).status_code
            == 202
        )
        failed = finished(client, job_id)
        assert failed["status"] == "failed"
        assert failed["export_generated"] is True
        assert failed["motion_validation_passed"] is False
        assert failed["bundle_path"] is None
        assert (
            client.get(f"/api/assembly-jobs/{job_id}/files/{failed['validation_path']}").json()[
                "reason"
            ]
            == "fixture failure"
        )
        monkeypatch.setattr(assembly_jobs, "validate_assembly", lambda scene: {"passed": True})
        assert (
            client.post(
                f"/api/assembly-jobs/{job_id}/process",
                json={
                    "expected_revision": 1,
                    "collision_mode": "convex_mesh",
                    "exclude_joint_pairs": True,
                },
            ).status_code
            == 202
        )
        completed = finished(client, job_id)
        assert completed["status"] == "completed"
        assert len(completed["attempts"]) == 2
        assert completed["attempts"][0]["motion_validation_passed"] is False
        assert completed["attempts"][1]["export_config"] == {
            "collision_mode": "convex_mesh",
            "exclude_joint_pairs": True,
        }
        assert (
            client.get(f"/api/assembly-jobs/{job_id}/files/{failed['validation_path']}").status_code
            == 200
        )


def test_invalid_paths_archives_limits_and_stale_review(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, max_asset_bytes=1000))) as client:
        bad = project()
        bad["parts"][0]["mesh"] = "../base.obj"
        files = [
            ("project", ("project.json", json.dumps(bad), "application/json")),
            (
                "meshes",
                (
                    "../base.obj",
                    (FIXTURE / "meshes/base.obj").read_bytes(),
                    "application/octet-stream",
                ),
            ),
            (
                "meshes",
                (
                    "meshes/arm.obj",
                    (FIXTURE / "meshes/arm.obj").read_bytes(),
                    "application/octet-stream",
                ),
            ),
        ]
        assert client.post("/api/assembly-jobs", files=files).status_code == 422
        archived = project()
        archived["parts"][0]["mesh"] = "meshes/base.zip"
        archived["parts"][0]["sha256"] = hashlib.sha256(b"zip-data").hexdigest()
        files = [
            ("project", ("project.json", json.dumps(archived), "application/json")),
            ("meshes", ("meshes/base.zip", b"zip-data", "application/zip")),
            (
                "meshes",
                (
                    "meshes/arm.obj",
                    (FIXTURE / "meshes/arm.obj").read_bytes(),
                    "application/octet-stream",
                ),
            ),
        ]
        assert client.post("/api/assembly-jobs", files=files).status_code == 422
    with TestClient(create_app(Settings(data_dir=tmp_path, max_asset_bytes=10))) as client:
        assert upload(client).status_code == 413
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        job = upload(client).json()
        job_id = job["id"]
        stale = project()
        stale["groups"][0]["mass_kg"]["value"] = 0.7
        response = client.put(
            f"/api/assembly-jobs/{job_id}/revisions",
            json={"expected_revision": 1, "project": stale},
        )
        assert response.status_code == 201
        response = client.post(
            f"/api/assembly-jobs/{job_id}/process", json={"expected_revision": 2}
        )
        assert response.status_code == 422
        assert "stale" in response.text or "changed" in response.text
        assert not client.get(f"/api/assembly-jobs/{job_id}").json()["attempts"]


def test_download_rejects_symlink_even_when_target_stays_inside_job(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        job = upload(client).json()
        root = tmp_path / "assemblies" / job["id"]
        alias = root / "source-alias.obj"
        try:
            os.symlink(root / "sources/meshes/base.obj", alias)
        except OSError:
            pytest.skip("Creating symlinks is unavailable on this Windows host")
        assert (
            client.get(f"/api/assembly-jobs/{job['id']}/files/source-alias.obj").status_code == 404
        )
