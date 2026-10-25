"""Bounded ACP attachment intake and recipient-only result delivery."""

import asyncio
import base64
from urllib.parse import urlsplit
from uuid import UUID

import httpx

from photo2sim.integrations.fetch_agent.workflow import (
    MAX_IMAGE_BYTES,
    MIME_EXTENSIONS,
    decode_images,
)

STORAGE_URL = "https://agentverse.ai/v1/storage"


def resource_uri(resource) -> str:
    candidates = [
        resource.uri,
        *(resource.metadata.get(key, "") for key in ("url", "uri", "source", "image_url")),
    ]
    return next(
        (
            value
            for value in candidates
            if value.startswith(("data:", "agent-storage://", "https://"))
        ),
        resource.uri,
    )


class AttachmentBridge:
    def __init__(self, identity, *, api_key="", allowed_hosts=(), storage=None, client=None):
        from uagents_core.storage import ExternalStorage

        # Explicit URL: uagents-core 0.4.12's default refers to a missing config attribute.
        self.storage = storage or ExternalStorage(
            identity=identity, api_token=api_key or None, storage_url=STORAGE_URL
        )
        self.can_publish = bool(api_key) or storage is not None
        self.allowed_hosts = {host.strip().lower() for host in allowed_hosts if host.strip()}
        # Never reuse the authenticated backend client for remote image URLs.
        self.client = client or httpx.AsyncClient(timeout=20, follow_redirects=False)

    async def images(self, uris: list[str]) -> list[str]:
        if not 1 <= len(uris) <= 4:
            raise ValueError("Attach 1–4 JPEG, PNG, or WebP images.")
        result = []
        for uri in uris:
            if uri.startswith("data:"):
                decode_images([uri])
                result.append(uri)
                continue
            if uri.startswith("agent-storage://"):
                prefix = f"agent-storage://{STORAGE_URL}/"
                if not uri.startswith(prefix):
                    raise ValueError("Unsupported Agent Storage location.")
                asset_id = str(UUID(uri.removeprefix(prefix)))
                try:
                    item = await asyncio.to_thread(self.storage.download, asset_id)
                    mime, encoded = item["mime_type"], item["contents"]
                    data_uri = f"data:{mime};base64,{encoded}"
                    decode_images([data_uri])
                except Exception:
                    raise ValueError(
                        "Cannot read the image attachment. Grant this agent access and resend."
                    ) from None
                result.append(data_uri)
                continue
            parsed = urlsplit(uri)
            if (
                parsed.scheme != "https"
                or parsed.hostname not in self.allowed_hosts
                or parsed.username
                or parsed.password
                or parsed.port not in (None, 443)
            ):
                raise ValueError(
                    "Attachment host is not configured. Ask the operator to allow the observed ASI:One attachment host, then resend."
                )
            try:
                async with self.client.stream("GET", uri) as response:
                    if response.status_code != 200:
                        raise ValueError("Image attachment could not be downloaded; resend it.")
                    mime = response.headers.get("Content-Type", "").split(";")[0].lower()
                    if mime not in MIME_EXTENSIONS:
                        raise ValueError("Attachment must be JPEG, PNG, or WebP.")
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > MAX_IMAGE_BYTES:
                            raise ValueError("Each image must be at most 10 MiB.")
            except httpx.RequestError:
                raise ValueError(
                    "Image attachment download failed. Resend it or retry later."
                ) from None
            result.append(f"data:{mime};base64,{base64.b64encode(data).decode()}")
        return result

    async def publish(self, name: str, data: bytes, mime: str, recipient: str):
        from uagents_core.contrib.protocols.chat import Resource, ResourceContent

        if not self.can_publish:
            raise ValueError(
                "Agentverse storage is not configured; authenticated result delivery awaits setup."
            )
        try:
            asset_id = await asyncio.to_thread(
                self.storage.create_asset, name=name, content=data, mime_type=mime, lifetime_hours=1
            )
            await asyncio.to_thread(
                self.storage.set_permissions,
                asset_id=asset_id,
                agent_address=recipient,
                read=True,
                write=False,
            )
            return ResourceContent(
                type="resource",
                resource_id=UUID(asset_id),
                resource=Resource(
                    uri=f"agent-storage://{STORAGE_URL}/{asset_id}",
                    metadata={"mime_type": mime, "role": "attachment", "filename": name},
                ),
            )
        except Exception:
            raise ValueError(
                "Private result delivery failed. The backend files are retained; retry files later."
            ) from None
