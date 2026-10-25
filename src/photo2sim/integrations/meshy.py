"""Meshy's documented multi-image API; generation is explicit and never auto-retried."""

import base64
import struct
from pathlib import Path
from urllib.parse import quote, urlsplit

import httpx

from photo2sim.api.config import Settings
from photo2sim.integrations.reconstruction import ProviderError, ProviderSnapshot


class MeshyProvider:
    name = "meshy"
    endpoint = "https://api.meshy.ai/openapi/v1/multi-image-to-3d"

    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.settings = settings
        self.transport = transport

    def request(self, method: str, url: str, **kwargs) -> dict:
        try:
            with httpx.Client(timeout=60, transport=self.transport) as client:
                response = client.request(
                    method,
                    url,
                    headers={"Authorization": f"Bearer {self.settings.meshy_api_key}"},
                    **kwargs,
                )
                response.raise_for_status()
                result = response.json()
                if not isinstance(result, dict):
                    raise ValueError("Expected task object")
                return result
        except httpx.HTTPStatusError as error:
            raise ProviderError(
                "provider_http_error",
                f"Meshy returned HTTP {error.response.status_code}. Check API access/credits/task.",
            ) from None
        except (httpx.RequestError, ValueError):
            if method == "POST":
                raise ProviderError(
                    "submission_uncertain",
                    "Submission result is unknown. Inspect Meshy's dashboard before resubmitting.",
                ) from None
            raise ProviderError(
                "provider_response_error", "Could not read Meshy task status."
            ) from None

    def submit(self, images: list[Path]) -> str:
        if not 1 <= len(images) <= 4:
            raise ProviderError("invalid_images", "Meshy requires one to four verified images.")
        image_urls = []
        for image in images:
            mime = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}[image.suffix]
            encoded = base64.b64encode(image.read_bytes()).decode("ascii")
            image_urls.append(f"data:{mime};base64,{encoded}")
        response = self.request(
            "POST",
            self.endpoint,
            json={
                "image_urls": image_urls,
                "ai_model": self.settings.meshy_model,
                "should_texture": False,
                "target_formats": ["glb"],
                "auto_size": False,
            },
        )
        task_id = response.get("result")
        if not isinstance(task_id, str) or not task_id.strip():
            raise ProviderError(
                "submission_uncertain",
                "Meshy did not return a task ID. Inspect its dashboard before resubmitting.",
            )
        return task_id

    def poll(self, task_id: str) -> ProviderSnapshot:
        result = self.request("GET", f"{self.endpoint}/{quote(task_id, safe='')}")
        state = {
            "PENDING": "pending",
            "IN_PROGRESS": "running",
            "SUCCEEDED": "succeeded",
            "FAILED": "failed",
            "CANCELED": "failed",
        }.get(result.get("status"))
        if state is None:
            raise ProviderError("provider_response_error", "Meshy returned an unknown task status.")
        urls = result.get("model_urls") or {}
        mesh_url = urls.get("glb") if isinstance(urls, dict) else None
        if state == "succeeded" and (not isinstance(mesh_url, str) or not mesh_url):
            raise ProviderError("missing_mesh", "Completed Meshy task has no GLB output.")
        progress = result.get("progress")
        if progress is not None and (type(progress) is not int or not 0 <= progress <= 100):
            raise ProviderError("provider_response_error", "Meshy returned invalid progress.")
        return ProviderSnapshot(status=state, progress=progress, mesh_url=mesh_url)

    def download(self, snapshot: ProviderSnapshot, output_dir: Path) -> Path:
        url = urlsplit(snapshot.mesh_url or "")
        if (
            url.scheme != "https"
            or url.hostname != "assets.meshy.ai"
            or url.username
            or url.password
            or url.port not in (None, 443)
        ):
            raise ProviderError("invalid_asset_url", "Meshy output must use its HTTPS asset host.")
        output_dir.mkdir(parents=True, exist_ok=True)
        partial = output_dir / "mesh.glb.part"
        destination = output_dir / "mesh.glb"
        try:
            # Separate unauthenticated client: never forward the Meshy API key to asset storage.
            with httpx.Client(timeout=60, transport=self.transport) as client:
                with client.stream("GET", snapshot.mesh_url) as response:
                    response.raise_for_status()
                    size = 0
                    with partial.open("wb") as output:
                        for chunk in response.iter_bytes():
                            size += len(chunk)
                            if size > self.settings.max_asset_bytes:
                                raise ProviderError(
                                    "asset_too_large", "Mesh exceeds 100 MiB limit."
                                )
                            output.write(chunk)
            with partial.open("rb") as saved:
                header = saved.read(12)
            if (
                len(header) != 12
                or header[:4] != b"glTF"
                or struct.unpack("<I", header[4:8])[0] != 2
                or struct.unpack("<I", header[8:12])[0] != partial.stat().st_size
                or partial.stat().st_size <= 20
            ):
                raise ProviderError("invalid_mesh", "Downloaded output is not a complete GLB v2.")
            partial.replace(destination)
            return destination
        except (httpx.HTTPError, OSError):
            raise ProviderError(
                "asset_download_error", "Mesh download failed. The provider task ID is retained."
            ) from None
        finally:
            partial.unlink(missing_ok=True)
