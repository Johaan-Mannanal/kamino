"""Small, explicit chat commands mapped to the shared backend API."""

import base64
import binascii
import json
from urllib.parse import quote
from uuid import UUID

import httpx

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MIME_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
RUNNING = {"queued", "reconstructing", "preparing", "validating"}


def decode_images(uris: list[str]) -> list[tuple[str, bytes, str]]:
    if not 1 <= len(uris) <= 4:
        raise ValueError("Attach 1–4 images as data URI resources.")
    images = []
    for index, uri in enumerate(uris):
        prefix, separator, encoded = uri.partition(",")
        mime = prefix.removeprefix("data:").removesuffix(";base64")
        if not separator or not prefix.endswith(";base64") or mime not in MIME_EXTENSIONS:
            raise ValueError("Use base64 data URI resources with JPEG, PNG, or WebP images.")
        if len(encoded) > (MAX_IMAGE_BYTES + 2) * 4 // 3 + 4:
            raise ValueError("Each image must be at most 10 MiB.")
        try:
            data = base64.b64decode(encoded, validate=True)
        except binascii.Error as error:
            raise ValueError("An image has invalid base64 data.") from error
        if len(data) > MAX_IMAGE_BYTES:
            raise ValueError("Each image must be at most 10 MiB.")
        images.append((f"view-{index + 1}.{MIME_EXTENSIONS[mime]}", data, mime))
    return images


def summarize(job: dict) -> str:
    label = "SYNTHETIC MOCK" if job["synthetic"] else "PROVIDER GENERATED"
    lines = [f"Job {job['id']}: {job['status']} ({label}, provider {job['provider']})."]
    if job["status"] in RUNNING:
        lines.append(f"Reconstruction progress: {job['progress']}%. Check status again later.")
    elif job["status"] == "awaiting_properties":
        lines.append(
            "Reconstruction finished. Confirm full dimensions in metres and mass in kilograms."
        )
        if job.get("properties"):
            lines.append(
                f"Properties saved. Send process {job['id']} to prepare and validate the scene."
            )
        else:
            lines.append("Geometry preparation and MuJoCo export have not completed.")
    elif job["status"] == "failed":
        error = job.get("error") or {}
        lines.append(
            f"Failure: {error.get('code', 'unknown')}: {error.get('message', 'No detail available')}"
        )
    elif job["status"] == "completed":
        lines.append("The backend reports a completed export; inspect validation before use.")
    paths = [job.get("mesh_path"), job.get("export_path"), job.get("validation_path")]
    if job["status"] == "completed":
        paths.append(job.get("bundle_path"))
    lines.extend(f"Artifact: {path}" for path in paths if path)
    return "\n".join(lines)


class Workflow:
    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None, api_token: str = ""):
        self.base_url = base_url.rstrip("/")
        self.client = client or httpx.AsyncClient(
            timeout=30, headers={"Authorization": f"Bearer {api_token}"} if api_token else {}
        )

    async def download_results(self, job_id: str) -> list[tuple[str, bytes, str]]:
        from photo2sim.contracts import bundle_path

        job_id = str(UUID(job_id))
        response = await self.client.get(f"{self.base_url}/api/jobs/{job_id}")
        response.raise_for_status()
        record = response.json()
        if record["status"] != "completed" or not record.get("bundle_path"):
            raise ValueError("A validated simulation ZIP is not ready yet.")
        results = []
        for field, mime in (
            ("bundle_path", "application/zip"),
            ("validation_path", "application/json"),
        ):
            path = record.get(field)
            if not path:
                continue
            bundle_path(path)
            async with self.client.stream(
                "GET", f"{self.base_url}/api/jobs/{job_id}/files/{quote(path, safe='/')}"
            ) as result:
                result.raise_for_status()
                content = bytearray()
                async for chunk in result.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > 100 * 1024 * 1024:
                        raise ValueError("Result exceeds the agent's 100 MiB attachment limit.")
            results.append((path.rsplit("/", 1)[-1], bytes(content), mime))
        return results

    async def run(self, text: str, resource_uris: list[str] | None = None) -> str:
        command, _, rest = text.strip().partition(" ")
        command = command.lower()
        if command in {"help", "start", ""}:
            return (
                "Photo2Sim commands: upload (attach 1–4 JPEG/PNG/WebP data URI resources), "
                "status <job UUID>, confirm <job UUID> <AssetProperties JSON>, "
                "process <job UUID>, files <job UUID>. "
                "Dimensions are full extents in metres; mass is kilograms; unknown friction is null. "
                "Sources: measured, user_supplied, sourced, estimated. "
                "Confirm properties before explicitly starting preparation and validation."
            )
        try:
            if command == "upload":
                images = decode_images(resource_uris or [])
                response = await self.client.post(
                    f"{self.base_url}/api/jobs",
                    files=[("images", image) for image in images],
                )
            elif command in {"status", "files"}:
                job_id = str(UUID(rest.strip()))
                response = await self.client.get(f"{self.base_url}/api/jobs/{job_id}")
            elif command == "process":
                job_id = str(UUID(rest.strip()))
                response = await self.client.post(f"{self.base_url}/api/jobs/{job_id}/process")
            elif command == "confirm":
                job_id, _, body = rest.partition(" ")
                job_id = str(UUID(job_id))
                properties = json.loads(body)
                if not isinstance(properties, dict):
                    raise ValueError("Properties must be a JSON object.")
                response = await self.client.patch(
                    f"{self.base_url}/api/jobs/{job_id}/properties", json=properties
                )
            else:
                return "Unknown command. Send 'help' for the supported Photo2Sim workflow."
            response.raise_for_status()
            record = response.json()
            text = summarize(record)
            if command == "files":
                text += "\nCompleted results are delivered as recipient-only Agentverse attachments when storage is configured. The backend token is never included in chat."
            return text
        except (ValueError, json.JSONDecodeError) as error:
            return f"Input error: {error}"
        except httpx.HTTPStatusError as error:
            try:
                detail = error.response.json().get("detail", error.response.text)
            except ValueError:
                detail = error.response.text
            return f"Backend rejected request (HTTP {error.response.status_code}): {detail}"
        except httpx.RequestError:
            return "Cannot reach the Photo2Sim backend. Check the configured API URL."
