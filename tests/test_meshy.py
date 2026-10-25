import base64
import json
import struct

import httpx
import pytest

from photo2sim.api.config import Settings
from photo2sim.integrations.meshy import MeshyProvider
from photo2sim.integrations.reconstruction import ProviderError, ProviderSnapshot


def settings(tmp_path, **kwargs):
    return Settings(data_dir=tmp_path, provider="meshy", meshy_api_key="test-secret", **kwargs)


def glb():
    content = b'{"asset":{"version":"2.0"}}'
    content += b" " * (-len(content) % 4)
    return (
        b"glTF"
        + struct.pack("<II", 2, 20 + len(content))
        + struct.pack("<II", len(content), 0x4E4F534A)
        + content
    )


def test_submit_encodes_images_and_uses_geometry_only_multi_image_endpoint(tmp_path):
    image = tmp_path / "view.png"
    image.write_bytes(b"verified-upload-bytes")

    def handle(request):
        assert request.method == "POST"
        assert str(request.url) == "https://api.meshy.ai/openapi/v1/multi-image-to-3d"
        assert request.headers["authorization"] == "Bearer test-secret"
        body = json.loads(request.content)
        assert body["target_formats"] == ["glb"]
        assert body["should_texture"] is False
        assert body["auto_size"] is False
        assert body["ai_model"] == "meshy-6"
        prefix, encoded = body["image_urls"][0].split(",", 1)
        assert prefix == "data:image/png;base64"
        assert base64.b64decode(encoded) == b"verified-upload-bytes"
        return httpx.Response(200, json={"result": "opaque-task-id"})

    provider = MeshyProvider(settings(tmp_path), transport=httpx.MockTransport(handle))
    assert provider.submit([image]) == "opaque-task-id"


@pytest.mark.parametrize(
    "status, expected", [("PENDING", "pending"), ("IN_PROGRESS", "running"), ("CANCELED", "failed")]
)
def test_poll_maps_provider_states(tmp_path, status, expected):
    provider = MeshyProvider(
        settings(tmp_path),
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"status": status, "progress": 42})
        ),
    )
    snapshot = provider.poll("task")
    assert snapshot.status == expected
    assert snapshot.progress == 42


def test_completed_mesh_download_is_local_and_has_no_authorization_header(tmp_path):
    payload = glb()

    def handle(request):
        if request.url.host == "api.meshy.ai":
            return httpx.Response(
                200,
                json={
                    "status": "SUCCEEDED",
                    "progress": 100,
                    "model_urls": {"glb": "https://assets.meshy.ai/task/model.glb?Expires=123"},
                },
            )
        assert "authorization" not in request.headers
        return httpx.Response(200, content=payload)

    provider = MeshyProvider(settings(tmp_path), transport=httpx.MockTransport(handle))
    snapshot = provider.poll("task")
    output = provider.download(snapshot, tmp_path / "output")
    assert output.name == "mesh.glb"
    assert output.read_bytes() == payload
    assert not list(output.parent.glob("*.part"))


@pytest.mark.parametrize("body", [{}, {"result": ""}, {"result": 123}])
def test_malformed_submission_response_is_not_retried_or_treated_as_a_task(tmp_path, body):
    image = tmp_path / "view.png"
    image.write_bytes(b"input")
    provider = MeshyProvider(
        settings(tmp_path),
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body)),
    )
    with pytest.raises(ProviderError) as error:
        provider.submit([image])
    assert error.value.code == "submission_uncertain"


def test_provider_errors_do_not_expose_key_or_response_body(tmp_path):
    provider = MeshyProvider(
        settings(tmp_path),
        transport=httpx.MockTransport(
            lambda request: httpx.Response(402, json={"message": "test-secret signed?token=123"})
        ),
    )
    with pytest.raises(ProviderError) as error:
        provider.poll("task")
    assert "402" in error.value.message
    assert "test-secret" not in error.value.message
    assert "token=123" not in error.value.message


def test_interrupted_submit_is_explicitly_uncertain(tmp_path):
    image = tmp_path / "image.png"
    image.write_bytes(b"input")

    def handle(request):
        raise httpx.ReadTimeout("secret in transport exception", request=request)

    provider = MeshyProvider(settings(tmp_path), transport=httpx.MockTransport(handle))
    with pytest.raises(ProviderError) as error:
        provider.submit([image])
    assert error.value.code == "submission_uncertain"
    assert "secret" not in error.value.message


@pytest.mark.parametrize("payload", [b"<html>not a model</html>", glb()[:-4], b""])
def test_invalid_download_does_not_publish_partial_mesh(tmp_path, payload):
    provider = MeshyProvider(
        settings(tmp_path),
        transport=httpx.MockTransport(lambda request: httpx.Response(200, content=payload)),
    )
    with pytest.raises(ProviderError):
        provider.download(
            ProviderSnapshot(status="succeeded", mesh_url="https://assets.meshy.ai/model.glb"),
            tmp_path / "output",
        )
    assert not (tmp_path / "output" / "mesh.glb").exists()
    assert not list((tmp_path / "output").glob("*.part"))


def test_asset_download_size_limit_cleans_partial_output(tmp_path):
    provider = MeshyProvider(
        settings(tmp_path, max_asset_bytes=20),
        transport=httpx.MockTransport(lambda request: httpx.Response(200, content=glb())),
    )
    with pytest.raises(ProviderError) as error:
        provider.download(
            ProviderSnapshot(status="succeeded", mesh_url="https://assets.meshy.ai/model.glb"),
            tmp_path / "output",
        )
    assert error.value.code == "asset_too_large"
    assert not (tmp_path / "output" / "mesh.glb").exists()


@pytest.mark.parametrize("url", ["http://assets.meshy.ai/a", "https://localhost/a", "file:///a"])
def test_non_provider_asset_urls_are_rejected_before_network_access(tmp_path, url):
    def unexpected(request):
        pytest.fail("Untrusted URL must not be fetched")

    provider = MeshyProvider(settings(tmp_path), transport=httpx.MockTransport(unexpected))
    with pytest.raises(ProviderError):
        provider.download(ProviderSnapshot(status="succeeded", mesh_url=url), tmp_path / "output")


def test_success_without_glb_is_an_actionable_failure(tmp_path):
    provider = MeshyProvider(
        settings(tmp_path),
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"status": "SUCCEEDED", "model_urls": {}})
        ),
    )
    with pytest.raises(ProviderError) as error:
        provider.poll("task")
    assert error.value.code == "missing_mesh"


@pytest.mark.parametrize("progress", [None, "missing"])
def test_poll_retains_unknown_progress_without_inventing_zero(tmp_path, progress):
    body = {"status": "IN_PROGRESS"}
    if progress is None:
        body["progress"] = None
    provider = MeshyProvider(
        settings(tmp_path),
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=body)),
    )
    assert provider.poll("task").progress is None


@pytest.mark.parametrize("progress", [True, -1, 101, 0.5, "42"])
def test_invalid_provider_percentages_fail_closed(tmp_path, progress):
    provider = MeshyProvider(
        settings(tmp_path),
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, json={"status": "IN_PROGRESS", "progress": progress}
            )
        ),
    )
    with pytest.raises(ProviderError) as error:
        provider.poll("task")
    assert error.value.code == "provider_response_error"
