"""Mapping-review retention alongside append-only assembly job evidence."""

import io
import json
import zipfile

from fastapi.testclient import TestClient
from test_assembly_jobs_api import finished, project, upload

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings


def mapping_review(saved_project):
    from photo2sim.assemblies.mapping_review import canonical_json, expected_comparisons
    from photo2sim.assemblies.review import ReviewProject

    review = {
        "format": "photo2sim-mapping-review-1.0",
        "project_snapshot": canonical_json(saved_project),
        "captures": {
            "format": "photo2sim-captures-1.0",
            "captures": [
                {
                    "id": "pose-a",
                    "samples": 2,
                    "calibration_sha256": "a" * 64,
                    "source_hashes": {"recording": "b" * 64},
                    "pairing": {"source": "fixture"},
                    "signals": {
                        "hinge": {"unit": "degrees", "median": 1, "minimum": 0, "maximum": 2}
                    },
                    "photos": [],
                },
                {
                    "id": "pose-b",
                    "samples": 2,
                    "calibration_sha256": "a" * 64,
                    "source_hashes": {"recording": "c" * 64},
                    "pairing": {"source": "fixture"},
                    "signals": {
                        "hinge": {"unit": "degrees", "median": 2, "minimum": 1, "maximum": 3}
                    },
                    "photos": [],
                },
            ],
        },
        "mappings": [
            {
                "joint": "hinge",
                "signal": "hinge",
                "unit": "degrees",
                "sign": 1,
                "offset_rad": 0,
                "radians_per_unit": 0.017453292519943295,
                "status": "unverified",
                "reviewer": "",
                "evidence_note": "",
                "capture_ids": [],
                "verification_binding": None,
            }
        ],
        "comparisons": [],
        "physical_accuracy_verified": False,
        "note": "Fixture only; not calibration.",
    }
    review["comparisons"] = expected_comparisons(
        ReviewProject.model_validate(saved_project),
        review["captures"]["captures"],
        review["mappings"],
    )
    return review


def browser_numbers(value):
    if isinstance(value, dict):
        return {key: browser_numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [browser_numbers(item) for item in value]
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def test_mapping_review_is_retained_with_a_revision_and_cas(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        job = upload(client).json()
        review = mapping_review(project())
        saved = client.put(
            f"/api/assembly-jobs/{job['id']}/mapping-review",
            json={"expected_revision": 1, "expected_mapping_version": 0, "review": review},
        )
        assert saved.status_code == 200, saved.text
        state = saved.json()
        assert state["mapping_version"] == 1
        assert state["mapping_review_path"] == "revisions/0001/mapping-review-0001.json"
        retained = client.get(
            f"/api/assembly-jobs/{job['id']}/files/{state['mapping_review_path']}"
        )
        assert retained.status_code == 200
        assert retained.json() == review

        stale = client.put(
            f"/api/assembly-jobs/{job['id']}/mapping-review",
            json={"expected_revision": 1, "expected_mapping_version": 0, "review": review},
        )
        assert stale.status_code == 409


def test_mapping_review_rejects_unauthorized_stale_and_forged_attestations(tmp_path):
    token = "mapping-token"
    with TestClient(create_app(Settings(data_dir=tmp_path, api_token=token))) as client:
        client.headers["Authorization"] = f"Bearer {token}"
        job = upload(client).json()
        base = f"/api/assembly-jobs/{job['id']}/mapping-review"
        review = mapping_review(project())
        client.headers.clear()
        assert (
            client.put(
                base, json={"expected_revision": 1, "expected_mapping_version": 0, "review": review}
            ).status_code
            == 401
        )
        client.headers["Authorization"] = f"Bearer {token}"
        stale = dict(review)
        stale["project_snapshot"] = "{}"
        assert (
            client.put(
                base, json={"expected_revision": 1, "expected_mapping_version": 0, "review": stale}
            ).status_code
            == 422
        )
        forged = mapping_review(project())
        mapping = forged["mappings"][0]
        mapping.update(
            status="user_verified",
            reviewer="A reviewer",
            evidence_note="Evidence",
            capture_ids=["pose-a", "pose-b"],
            verification_binding="forged",
        )
        assert (
            client.put(
                base, json={"expected_revision": 1, "expected_mapping_version": 0, "review": forged}
            ).status_code
            == 422
        )


def test_mapping_review_compares_browser_json_semantically_and_rejects_bad_types(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        job = upload(client).json()
        review = mapping_review(project())
        review["project_snapshot"] = json.dumps(browser_numbers(project()), separators=(",", ":"))
        response = client.put(
            f"/api/assembly-jobs/{job['id']}/mapping-review",
            json={"expected_revision": 1, "expected_mapping_version": 0, "review": review},
        )
        assert response.status_code == 200, response.text

        malformed = mapping_review(project())
        malformed["mappings"][0]["sign"] = True
        response = client.put(
            f"/api/assembly-jobs/{job['id']}/mapping-review",
            json={"expected_revision": 1, "expected_mapping_version": 1, "review": malformed},
        )
        assert response.status_code == 422

        false_claim = mapping_review(project())
        false_claim["physical_accuracy_verified"] = True
        response = client.put(
            f"/api/assembly-jobs/{job['id']}/mapping-review",
            json={"expected_revision": 1, "expected_mapping_version": 1, "review": false_claim},
        )
        assert response.status_code == 422

        forged = mapping_review(project())
        forged["comparisons"][0]["joints"]["hinge"]["angle_rad"] = 999
        response = client.put(
            f"/api/assembly-jobs/{job['id']}/mapping-review",
            json={"expected_revision": 1, "expected_mapping_version": 1, "review": forged},
        )
        assert response.status_code == 422


def test_revision_clears_mapping_pointer_but_retains_the_old_mapping_file(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        job = upload(client).json()
        review = mapping_review(project())
        saved = client.put(
            f"/api/assembly-jobs/{job['id']}/mapping-review",
            json={"expected_revision": 1, "expected_mapping_version": 0, "review": review},
        ).json()
        original = client.get(
            f"/api/assembly-jobs/{job['id']}/files/{saved['mapping_review_path']}"
        ).content
        revised = client.put(
            f"/api/assembly-jobs/{job['id']}/revisions",
            json={"expected_revision": 1, "project": project()},
        )
        assert revised.status_code == 201, revised.text
        assert revised.json()["mapping_review_path"] is None
        assert revised.json()["mapping_version"] == 0
        assert (
            client.get(
                f"/api/assembly-jobs/{job['id']}/files/{saved['mapping_review_path']}"
            ).content
            == original
        )

    # Job state and the retained evidence are reloadable after a server restart.
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        reloaded = client.get(f"/api/assembly-jobs/{job['id']}").json()
        assert reloaded["revision"] == 2
        assert (
            client.get(
                f"/api/assembly-jobs/{job['id']}/files/{saved['mapping_review_path']}"
            ).content
            == original
        )


def test_attempt_zip_contains_immutable_mapping_and_project_snapshots(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        job = upload(client).json()
        base = f"/api/assembly-jobs/{job['id']}"
        first = mapping_review(project())
        saved = client.put(
            base + "/mapping-review",
            json={"expected_revision": 1, "expected_mapping_version": 0, "review": first},
        ).json()
        mapping_bytes = client.get(base + "/files/" + saved["mapping_review_path"]).content
        assert (
            client.post(
                base + "/process", json={"expected_revision": 1, "expected_mapping_version": 1}
            ).status_code
            == 202
        )
        job = finished(client, job["id"])
        assert job["status"] == "completed", job.get("error")
        archive = client.get(base + "/files/" + job["bundle_path"]).content
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            assert zipped.read("mapping-review.json") == mapping_bytes
            assert json.loads(zipped.read("reviewed-project.json")) == project()

        second = mapping_review(project())
        second["note"] = "Later attestation metadata"
        updated = client.put(
            base + "/mapping-review",
            json={"expected_revision": 1, "expected_mapping_version": 1, "review": second},
        )
        assert updated.status_code == 200, updated.text
        with zipfile.ZipFile(
            io.BytesIO(client.get(base + "/files/" + job["bundle_path"]).content)
        ) as zipped:
            assert zipped.read("mapping-review.json") == mapping_bytes

        # A tab which loaded version 1 cannot process the server's version 2.
        assert (
            client.post(
                base + "/process", json={"expected_revision": 1, "expected_mapping_version": 1}
            ).status_code
            == 409
        )
        assert (
            client.post(
                base + "/process", json={"expected_revision": 1, "expected_mapping_version": 2}
            ).status_code
            == 202
        )
        rerun = finished(client, job["id"])
        assert len(rerun["attempts"]) == 2
        with zipfile.ZipFile(
            io.BytesIO(client.get(base + "/files/" + rerun["bundle_path"]).content)
        ) as zipped:
            assert (
                zipped.read("mapping-review.json")
                == client.get(base + "/files/" + updated.json()["mapping_review_path"]).content
            )
        with zipfile.ZipFile(
            io.BytesIO(client.get(base + "/files/" + job["bundle_path"]).content)
        ) as zipped:
            assert zipped.read("mapping-review.json") == mapping_bytes
        assert (
            client.post(
                base + "/process", json={"expected_revision": 1, "expected_mapping_version": 2}
            ).status_code
            == 409
        )
