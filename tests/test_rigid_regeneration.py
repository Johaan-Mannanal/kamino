"""Cached reconstruction correction, immutable attempts and authoritative sizing."""

import hashlib
import json
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import numpy as np
import pytest
from fastapi.testclient import TestClient
from test_api import upload, wait_for
from test_pipeline import seed_job, terminal
from test_sizing import uniform

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.integrations.reconstruction import MockProvider
from photo2sim.simulation.validate import validate_export


class NoReconstruction(MockProvider):
    def submit(self, images):
        pytest.fail("Correction must not submit reconstruction")

    def poll(self, task_id):
        pytest.fail("Correction must not poll reconstruction")

    def download(self, snapshot, output_dir):
        pytest.fail("Correction must not download reconstruction")


def test_new_upload_cannot_silently_select_legacy_stretching(tmp_path):
    with TestClient(create_app(Settings(data_dir=tmp_path, poll_interval=0.01))) as client:
        job_id = upload(client).json()["id"]
        wait_for(client, job_id, "awaiting_properties")
        payload = {
            "dimensions_m": {"x": 0.04, "y": 0.05, "z": 0.06, "source": "estimated"},
            "mass_kg": {"value": 0.08, "source": "estimated"},
        }
        response = client.patch(f"/api/jobs/{job_id}/properties", json=payload)
        assert response.status_code == 422
        assert "sizing" in response.text.lower()


def test_preview_authoritative_save_and_reopen(tmp_path):
    job_id, store = seed_job(tmp_path)
    before = store.get(job_id).model_dump_json()
    sizing = uniform(axis="y", length=60)
    settings = Settings(data_dir=tmp_path, api_token="private-test-token")
    with TestClient(create_app(settings, NoReconstruction())) as client:
        request = {"sizing": sizing, "orientation": sizing["reviewed_orientation"]}
        assert client.post(f"/api/jobs/{job_id}/sizing-preview", json=request).status_code == 401
        client.headers["Authorization"] = "Bearer private-test-token"
        preview = client.post(f"/api/jobs/{job_id}/sizing-preview", json=request)
        assert preview.status_code == 200, preview.text
        assert store.get(job_id).model_dump_json() == before
        dims = preview.json()["dimensions_m"]
        assert [dims[a] for a in "xyz"] == pytest.approx([0.04, 0.06, 0.08])
        props = store.get(job_id).properties.model_dump(mode="json")
        props["sizing"] = sizing
        # The backend derives actual dimensions rather than trusting stale estimates.
        props["dimensions_m"].update(x=9, y=8, z=7)
        response = client.patch(f"/api/jobs/{job_id}/properties", json=props)
        assert response.status_code == 200, response.text
        assert response.json()["sizing_result"]["scale_factors"] == pytest.approx([0.02] * 3)
    with TestClient(create_app(settings, NoReconstruction())) as client:
        client.headers["Authorization"] = "Bearer private-test-token"
        job = client.get(f"/api/jobs/{job_id}").json()
        assert job["properties"]["sizing"] == {**sizing, "acknowledge_distortion": False}
        assert [job["properties"]["dimensions_m"][a] for a in "xyz"] == pytest.approx(
            [0.04, 0.06, 0.08]
        )


def test_completed_correction_keeps_immutable_inputs_and_downloads_without_provider(tmp_path):
    job_id, store = seed_job(tmp_path)
    source = store.job_dir(job_id) / store.get(job_id).mesh_path
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    with TestClient(create_app(Settings(data_dir=tmp_path), NoReconstruction())) as client:
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        first = terminal(client, job_id)
        old_path = first["bundle_path"]
        old_zip = client.get(f"/api/jobs/{job_id}/files/{old_path}").content
        old_inputs = first["attempts"][0]["inputs"]
        props = first["properties"]
        props["sizing"] = uniform(axis="y", length=60)
        corrected = client.patch(f"/api/jobs/{job_id}/properties", json=props)
        assert corrected.status_code == 200, corrected.text
        assert corrected.json()["status"] == "awaiting_properties"
        assert corrected.json()["bundle_path"] is None
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        second = terminal(client, job_id)
        assert second["bundle_path"] != old_path
        assert len(second["attempts"]) == 2
        assert second["attempts"][0]["inputs"] == old_inputs
        assert second["attempts"][0]["status"] == "completed"
        assert second["attempts"][1]["inputs"]["properties"]["sizing"]["mode"] == "uniform"
        assert client.get(f"/api/jobs/{job_id}/files/{old_path}").content == old_zip
        assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 409
        zipped = client.get(f"/api/jobs/{job_id}/files/{second['bundle_path']}").content
        with ZipFile(BytesIO(zipped)) as z:
            inputs = json.loads(z.read("inputs.json"))
            assert inputs["source_mesh_sha256"] == source_hash
            assert inputs["properties"] == second["properties"]
            out = tmp_path / "independent-relocation"
            z.extractall(out)
        assert validate_export(out / "scene.xml")["passed"]
        result = second["asset"]["sizing_result"]
        assert np.allclose(result["scale_factors"], [0.02] * 3)


def test_legacy_completed_job_retains_download_metadata_before_edit(tmp_path):
    job_id, store = seed_job(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        client.post(f"/api/jobs/{job_id}/process")
        first = terminal(client, job_id)
    # Simulate a pre-upgrade database record without the new attempt index.
    store.update(job_id, attempts=[], active_attempt_id=None)
    old_bytes = (store.job_dir(job_id) / first["bundle_path"]).read_bytes()
    with TestClient(create_app(Settings(data_dir=tmp_path), NoReconstruction())) as client:
        changed = client.patch(f"/api/jobs/{job_id}/orientation", json={"x_deg": 90})
        assert changed.status_code == 200, changed.text
        retained = changed.json()["attempts"]
        assert len(retained) == 1
        assert retained[0]["bundle_path"] == first["bundle_path"]
        assert retained[0]["inputs"]["orientation"]["x_deg"] == 0
        assert client.get(f"/api/jobs/{job_id}/files/{first['bundle_path']}").content == old_bytes


def test_orientation_change_blocks_stale_reference_and_does_not_create_attempt(tmp_path):
    job_id, store = seed_job(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path), NoReconstruction())) as client:
        props = store.get(job_id).properties.model_dump(mode="json")
        props["sizing"] = uniform()
        assert client.patch(f"/api/jobs/{job_id}/properties", json=props).status_code == 200
        assert (
            client.patch(f"/api/jobs/{job_id}/orientation", json={"x_deg": 90}).status_code == 200
        )
        result = client.post(f"/api/jobs/{job_id}/process")
        assert result.status_code == 409
        assert "review" in result.text.lower()
        assert store.get(job_id).attempts == []


def test_explicit_sizing_cannot_fall_back_to_silent_legacy_stretching(tmp_path):
    job_id, store = seed_job(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        props = store.get(job_id).properties.model_dump(mode="json")
        props["sizing"] = uniform()
        assert client.patch(f"/api/jobs/{job_id}/properties", json=props).status_code == 200
        props["sizing"] = None
        assert client.patch(f"/api/jobs/{job_id}/properties", json=props).status_code == 422


def test_missing_reconstruction_blocks_completed_edits_without_losing_result(tmp_path):
    job_id, store = seed_job(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        first = terminal(client, job_id)
        source = store.job_dir(job_id) / first["mesh_path"]
        source.rename(source.with_suffix(".retained"))
        before = store.get(job_id).model_dump_json()
        assert (
            client.patch(f"/api/jobs/{job_id}/orientation", json={"x_deg": 90}).status_code == 422
        )
        assert (
            client.patch(f"/api/jobs/{job_id}/properties", json=first["properties"]).status_code
            == 422
        )
        assert store.get(job_id).model_dump_json() == before
        assert client.get(f"/api/jobs/{job_id}/files/{first['bundle_path']}").status_code == 200


def test_claim_rejects_revision_changed_while_process_request_was_preparing(tmp_path, monkeypatch):
    job_id, store = seed_job(tmp_path)
    original = JobStore.update

    def change_before_claim(self, target, **changes):
        if changes.get("status") == "preparing":
            original(self, target, input_revision=self.get(target).input_revision + 1)
        return original(self, target, **changes)

    with TestClient(create_app(Settings(data_dir=tmp_path), NoReconstruction())) as client:
        monkeypatch.setattr(JobStore, "update", change_before_claim)
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 409
        assert store.get(job_id).status == "awaiting_properties"


def test_failed_regeneration_keeps_previous_zip_and_each_attempts_inputs(tmp_path, monkeypatch):
    from photo2sim.api import pipeline

    job_id, store = seed_job(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path), NoReconstruction())) as client:
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        first = terminal(client, job_id)
        old = client.get(f"/api/jobs/{job_id}/files/{first['bundle_path']}").content
        props = first["properties"]
        props["sizing"] = uniform(axis="y", length=60)
        assert client.patch(f"/api/jobs/{job_id}/properties", json=props).status_code == 200
        validate = pipeline.validate_export
        monkeypatch.setattr(pipeline, "validate_export", lambda scene: {"passed": False})
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        failed = terminal(client, job_id)
        assert failed["status"] == "failed"
        assert failed["attempts"][0]["bundle_path"] == first["bundle_path"]
        assert failed["attempts"][1]["status"] == "failed"
        failed_inputs = client.get(
            f"/api/jobs/{job_id}/files/{failed['attempts'][1]['inputs_path']}"
        ).content
        assert client.get(f"/api/jobs/{job_id}/files/{first['bundle_path']}").content == old
        monkeypatch.setattr(pipeline, "validate_export", validate)
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        completed = terminal(client, job_id)
        assert len(completed["attempts"]) == 3
        assert (
            client.get(f"/api/jobs/{job_id}/files/{failed['attempts'][1]['inputs_path']}").content
            == failed_inputs
        )
        assert client.get(f"/api/jobs/{job_id}/files/{first['bundle_path']}").content == old


@pytest.mark.parametrize("source_failure", ["missing", "changed"])
def test_source_failure_after_claim_keeps_downloadable_inputs_and_prior_export(
    tmp_path, source_failure
):
    from photo2sim.api.pipeline import process_job

    job_id, store = seed_job(tmp_path)
    app = create_app(Settings(data_dir=tmp_path), NoReconstruction())
    with TestClient(app) as client:
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        first = terminal(client, job_id)
        old_zip = client.get(f"/api/jobs/{job_id}/files/{first['bundle_path']}").content
        source = store.job_dir(job_id) / first["mesh_path"]
        original_source = source.read_bytes()
        assert (
            client.patch(f"/api/jobs/{job_id}/properties", json=first["properties"]).status_code
            == 200
        )
        enqueue = app.state.worker.enqueue_processing
        app.state.worker.enqueue_processing = lambda _: None
        claimed = client.post(f"/api/jobs/{job_id}/process")
        assert claimed.status_code == 202
        if source_failure == "missing":
            source.rename(source.with_suffix(".retained-original"))
        else:
            source.write_bytes(b"Changed after claim, before the worker read the source")
        process_job(store, job_id)
        failed = client.get(f"/api/jobs/{job_id}").json()
        assert failed["status"] == "failed"
        attempt = failed["attempts"][-1]
        snapshot = client.get(f"/api/jobs/{job_id}/files/{attempt['inputs_path']}")
        assert snapshot.status_code == 200
        assert snapshot.json() == attempt["inputs"]
        assert snapshot.json()["source_mesh_sha256"] == hashlib.sha256(original_source).hexdigest()
        assert client.get(f"/api/jobs/{job_id}/files/{first['bundle_path']}").content == old_zip
        source.write_bytes(original_source)
        app.state.worker.enqueue_processing = enqueue
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        assert terminal(client, job_id)["status"] == "completed"
        assert (
            client.get(f"/api/jobs/{job_id}/files/{attempt['inputs_path']}").content
            == snapshot.content
        )


def test_snapshot_write_failure_never_advertises_a_missing_download_and_can_retry(
    tmp_path, monkeypatch
):
    job_id, store = seed_job(tmp_path)
    with TestClient(create_app(Settings(data_dir=tmp_path), NoReconstruction())) as client:
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        first = terminal(client, job_id)
        old_zip = client.get(f"/api/jobs/{job_id}/files/{first['bundle_path']}").content
        assert (
            client.patch(f"/api/jobs/{job_id}/properties", json=first["properties"]).status_code
            == 200
        )
        write_text = Path.write_text

        def fail_snapshot(path, *args, **kwargs):
            if path.name.startswith("inputs.json"):
                raise OSError("Synthetic snapshot storage failure")
            return write_text(path, *args, **kwargs)

        monkeypatch.setattr(Path, "write_text", fail_snapshot)
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        failed = terminal(client, job_id)
        assert failed["status"] == "failed"
        assert failed["attempts"][-1]["inputs_path"] is None
        assert failed["attempts"][-1]["inputs"]["properties"] == first["properties"]
        assert "snapshot" in failed["error"]["message"].lower()
        assert "history" in failed["error"]["message"].lower()
        assert client.get(f"/api/jobs/{job_id}/files/{first['bundle_path']}").content == old_zip
        monkeypatch.setattr(Path, "write_text", write_text)
        assert client.post(f"/api/jobs/{job_id}/process").status_code == 202
        assert terminal(client, job_id)["status"] == "completed"
