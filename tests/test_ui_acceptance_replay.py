"""Exercise offline fixtures through the existing API and real job worker."""

import hashlib
from io import BytesIO
from time import monotonic, sleep

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from tests.test_pipeline import seed_job
from tools import ui_acceptance_server as server


def terminal(client, ident, expected):
    end = monotonic() + 35
    while monotonic() < end:
        job = client.get(f"/api/jobs/{ident}").json()
        if job["status"] in expected:
            return job
        sleep(0.02)
    pytest.fail(f"No terminal state: {job}")


def photo():
    data = BytesIO()
    Image.new("RGB", (8, 8), "red").save(data, "PNG")
    return data.getvalue()


@pytest.fixture
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "ACCEPTANCE_ROOT", tmp_path)
    # TestClient has no external transport; retain and test the launcher guard separately.
    monkeypatch.setattr(server, "block_external_network", lambda _: None)
    return tmp_path / "data"


@pytest.mark.parametrize(
    "scenario,category",
    [
        ("malformed", "malformed"),
        ("truncated", "malformed"),
        ("quota", "quota"),
        ("overload", "overload"),
    ],
)
def test_gemini_error_replay_preserves_cached_estimates_and_saved_inputs(
    isolated, scenario, category
):
    app = server.build_app(isolated, "", gemini_replay=scenario)
    with TestClient(app) as client:
        result = client.post("/api/jobs", files=[("images", ("object.png", photo(), "image/png"))])
        ident = result.json()["id"]
        before = terminal(client, ident, {"awaiting_properties"})
        settings = server.acceptance_settings(isolated, "")
        from uuid import UUID

        cache = server.seed_suggestions(settings, UUID(ident))
        cache_before = cache.read_bytes()
        response = client.post(f"/api/jobs/{ident}/suggestions", json={"refresh": True})
        assert response.status_code == 503
        assert response.json()["category"] == category
        assert response.json()["manual_entry_available"] is True
        assert cache.read_bytes() == cache_before
        assert client.get(f"/api/jobs/{ident}").json() == before
        assert client.get(f"/api/jobs/{ident}/suggestions").json()["mass_kg"]["value"] == 0.08
        assert len(app.state.ui_acceptance["replay"].events) == 1


@pytest.mark.parametrize("stage", ["preparation", "validation"])
def test_processing_fault_is_job_scoped_one_shot_and_retry_preserves_history(isolated, stage):
    ident, store = seed_job(isolated)
    other, _ = seed_job(isolated)
    initial = store.get(ident)
    mesh = store.job_dir(ident) / initial.mesh_path
    mesh_before = hashlib.sha256(mesh.read_bytes()).hexdigest()
    app = server.build_app(isolated, "", fail_processing_job=ident, fail_processing_stage=stage)
    with TestClient(app) as client:
        # A different job must not consume the armed failure.
        assert client.post(f"/api/jobs/{other}/process").status_code == 202
        assert terminal(client, other, {"completed", "failed"})["status"] == "completed"
        assert client.post(f"/api/jobs/{ident}/process").status_code == 202
        failed = terminal(client, ident, {"completed", "failed"})
        assert failed["status"] == "failed"
        assert failed["error"]["code"] == stage + "_failed"
        assert failed["bundle_path"] is None
        assert failed["attempts"][0]["inputs_path"]
        if stage == "validation":
            report = client.get(f"/api/jobs/{ident}/files/{failed['validation_path']}").json()
            assert report["passed"] is False and report["offline_acceptance_fixture"] is True
        assert client.post(f"/api/jobs/{ident}/process").status_code == 202
        retried = terminal(client, ident, {"completed", "failed"})
        assert retried["status"] == "completed"
        assert len(retried["attempts"]) == 2
        assert retried["attempts"][0] == failed["attempts"][0]
        assert retried["attempts"][1]["id"] != failed["attempts"][0]["id"]
        assert mesh_before == hashlib.sha256(mesh.read_bytes()).hexdigest()
        assert len(app.state.ui_acceptance["replay"].events) == 1


def test_reconstruction_failure_uses_worker_retains_upload_and_next_upload_recovers(isolated):
    app = server.build_app(isolated, "", fail_next_reconstruction=True)
    with TestClient(app) as client:

        def upload():
            return client.post(
                "/api/jobs", files=[("images", ("object.png", photo(), "image/png"))]
            ).json()["id"]

        ident = upload()
        failed = terminal(client, ident, {"failed", "awaiting_properties"})
        assert failed["status"] == "failed" and failed["error"]["code"] == "provider_failed"
        assert failed["provider_task_id"]
        assert (
            client.get(f"/api/jobs/{ident}/files/{failed['source_images'][0]}").status_code == 200
        )
        later = upload()
        assert (
            terminal(client, later, {"failed", "awaiting_properties"})["status"]
            == "awaiting_properties"
        )
        assert client.get(f"/api/jobs/{ident}").json() == failed


def test_replay_disabled_by_default_and_cannot_add_production_routes(isolated):
    from photo2sim.api.app import create_app

    app = server.build_app(isolated, "")
    assert app.state.ui_acceptance["replay"] is None
    normal = create_app(server.acceptance_settings(isolated, ""))
    assert app.openapi()["paths"] == normal.openapi()["paths"]
    replay = server.build_app(isolated, "", gemini_replay="quota")
    assert replay.openapi()["paths"] == normal.openapi()["paths"]


def test_unknown_fixture_names_fail_closed(isolated):
    with pytest.raises(ValueError):
        server.build_app(isolated, "", gemini_replay="live")


@pytest.mark.parametrize("scenario", ["positive", "unknown"])
def test_successful_suggestion_replay_does_not_apply_properties(isolated, scenario):
    app = server.build_app(isolated, "", gemini_replay=scenario)
    with TestClient(app) as client:
        ident = client.post(
            "/api/jobs", files=[("images", ("object.png", photo(), "image/png"))]
        ).json()["id"]
        before = terminal(client, ident, {"awaiting_properties"})
        response = client.post(f"/api/jobs/{ident}/suggestions", json={"refresh": True})
        assert response.status_code == 200
        suggestion = response.json()
        if scenario == "positive":
            assert suggestion["mass_kg"]["value"] == 0.08
            assert suggestion["dimensions_m"]["z"] == 0.06
        else:
            assert suggestion["mass_kg"] is None
            assert suggestion["dimensions_m"] is None
        assert client.get(f"/api/jobs/{ident}").json() == before
