import asyncio
import base64
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest

pytest.importorskip("uagents_core")
from photo2sim.integrations.fetch_agent.attachments import (  # noqa:E402
    STORAGE_URL,
    AttachmentBridge,
    resource_uri,
)
from photo2sim.integrations.fetch_agent.workflow import Workflow  # noqa:E402


class FakeStorage:
    def __init__(self):
        self.asset_id = str(uuid4())
        self.created = None
        self.permissions = None

    def download(self, asset_id):
        return {"mime_type": "image/png", "contents": base64.b64encode(b"fixture").decode()}

    def create_asset(self, **values):
        self.created = values
        return self.asset_id

    def set_permissions(self, **values):
        self.permissions = values


def test_image_urls_are_allowlisted_bounded_and_do_not_receive_backend_token():
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, content=b"fixture", headers={"Content-Type": "image/png"})

    bridge = AttachmentBridge(
        None,
        storage=FakeStorage(),
        allowed_hosts=["media.test"],
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    result = asyncio.run(bridge.images(["https://media.test/image.png"]))
    assert result == ["data:image/png;base64," + base64.b64encode(b"fixture").decode()]
    assert "Authorization" not in requests[0].headers
    for uri in [
        "http://media.test/image.png",
        "https://127.0.0.1/private",
        "https://other.test/file",
    ]:
        with pytest.raises(ValueError, match="host"):
            asyncio.run(bridge.images([uri]))
    assert len(requests) == 1
    resource = SimpleNamespace(uri="opaque", metadata={"image_url": "https://media.test/image.png"})
    assert resource_uri(resource) == "https://media.test/image.png"


def test_storage_intake_and_recipient_only_result_permissions():
    storage = FakeStorage()
    bridge = AttachmentBridge(None, storage=storage)
    assert asyncio.run(bridge.images([f"agent-storage://{STORAGE_URL}/{uuid4()}"]))[0].startswith(
        "data:image/png;base64,"
    )
    result = asyncio.run(
        bridge.publish("simulation.zip", b"zip", "application/zip", "agent-recipient")
    )
    assert storage.created["lifetime_hours"] == 1
    assert storage.permissions == {
        "asset_id": storage.asset_id,
        "agent_address": "agent-recipient",
        "read": True,
        "write": False,
    }
    assert result.resource.metadata["mime_type"] == "application/zip"
    assert "token" not in result.resource.uri


def test_protected_results_use_backend_auth_and_require_completed_bundle():
    calls = []
    job_id = str(uuid4())
    state = {
        "status": "completed",
        "bundle_path": "attempts/one/simulation.zip",
        "validation_path": "attempts/one/bundle/validation-report.json",
    }

    def handler(request):
        calls.append(request)
        return (
            httpx.Response(200, json=state)
            if request.url.path.endswith(job_id)
            else httpx.Response(200, content=b"result")
        )

    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        headers={"Authorization": "Bearer private-test-token"},
    )
    workflow = Workflow("http://backend.test", client)
    results = asyncio.run(workflow.download_results(job_id))
    assert [item[0] for item in results] == ["simulation.zip", "validation-report.json"]
    assert all(request.headers["Authorization"] == "Bearer private-test-token" for request in calls)
    state["status"] = "failed"
    with pytest.raises(ValueError, match="not ready"):
        asyncio.run(workflow.download_results(job_id))
