import importlib.util
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings


def smoke_function():
    spec = importlib.util.spec_from_file_location(
        "deployment_smoke", Path("tools/deployment/smoke.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.check_backend


def test_smoke_refuses_real_provider_before_creating_any_job():
    calls = []

    def transport(request):
        calls.append(request.method)
        if request.url.path == "/api/health":
            return httpx.Response(200, json={"status": "ok", "provider": "meshy"})
        raise AssertionError("Real-provider smoke must stop before reaching any other endpoint")

    with httpx.Client(
        base_url="https://backend.example", transport=httpx.MockTransport(transport)
    ) as client:
        with pytest.raises(RuntimeError, match="requires provider=mock"):
            smoke_function()(client, run_mock=True)
    assert calls == ["GET"]


def test_smoke_exercises_authenticated_mock_pipeline_and_download(tmp_path):
    token = "test-deployment-only-token"
    with TestClient(
        create_app(Settings(data_dir=tmp_path, api_token=token)),
        headers={"Authorization": f"Bearer {token}"},
    ) as client:
        result = smoke_function()(client, run_mock=True)
        assert result["access_checked"] is True
        assert result["synthetic"] is True
        assert result["simulation_passed"] is True
        assert result["bundle_bytes"] > 0
