import asyncio
import base64
import json

import httpx

from photo2sim.integrations.fetch_agent.workflow import Workflow, decode_images


def test_data_uri_limits_and_content():
    encoded = base64.b64encode(b"test").decode()
    assert decode_images([f"data:image/png;base64,{encoded}"]) == [
        ("view-1.png", b"test", "image/png")
    ]
    try:
        decode_images(["https://example.com/private.png"])
    except ValueError:
        pass
    else:
        raise AssertionError("external URLs must not be fetched")


def test_commands_call_shared_api():
    calls = []
    job = {
        "id": "e40f8313-437d-4b06-a781-ad2cf7562eca",
        "status": "awaiting_properties",
        "synthetic": True,
        "provider": "mock",
        "progress": 100,
        "mesh_path": "reconstruction/mesh.obj",
        "export_path": None,
    }

    def handler(request):
        calls.append((request.method, request.url.path, request.content))
        return httpx.Response(200, json=job)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    workflow = Workflow("http://backend.test", client)
    job_id = job["id"]
    result = asyncio.run(workflow.run(f"status {job_id}"))
    assert "SYNTHETIC MOCK" in result
    assert "not completed" in result
    properties = {
        "dimensions_m": {"x": 0.04, "y": 0.05, "z": 0.06, "source": "measured"},
        "mass_kg": {"value": 0.08, "source": "user_supplied"},
        "sliding_friction": None,
    }
    asyncio.run(workflow.run(f"confirm {job_id} {json.dumps(properties)}"))
    assert calls[0][:2] == ("GET", f"/api/jobs/{job_id}")
    assert calls[1][:2] == ("PATCH", f"/api/jobs/{job_id}/properties")
    assert json.loads(calls[1][2]) == properties


def test_upload_process_and_completed_zip_gating():
    calls = []
    job_id = "e40f8313-437d-4b06-a781-ad2cf7562eca"
    record = {
        "id": job_id,
        "status": "failed",
        "provider": "mock",
        "synthetic": True,
        "progress": 100,
        "mesh_path": "reconstruction/mesh.obj",
        "bundle_path": "attempts/old/simulation.zip",
        "export_path": None,
        "error": {"code": "validation_failed", "message": "Checks failed"},
    }

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=record)

    workflow = Workflow(
        "http://backend.test", httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    encoded = base64.b64encode(b"synthetic").decode()
    asyncio.run(workflow.run("upload", [f"data:image/png;base64,{encoded}"]))
    assert calls[0].url.path == "/api/jobs"
    assert b'name="images"' in calls[0].content
    assert calls[0].headers["Content-Type"].startswith("multipart/form-data; boundary=")
    asyncio.run(workflow.run(f"process {job_id}"))
    assert calls[1].method == "POST"
    assert calls[1].url.path == f"/api/jobs/{job_id}/process"
    assert calls[1].content == b""
    assert "simulation.zip" not in asyncio.run(workflow.run(f"files {job_id}"))
    record["status"] = "completed"
    assert "simulation.zip" in asyncio.run(workflow.run(f"files {job_id}"))
