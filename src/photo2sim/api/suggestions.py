"""Optional, explicit property assistance; confirmed job inputs stay untouched."""

import json
from datetime import UTC, datetime
from pathlib import Path
from threading import BoundedSemaphore
from uuid import UUID

from PIL import Image, ImageOps
from pydantic import Field

from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.contracts import Contract, bundle_path
from photo2sim.integrations.gemini import (
    GeminiUnavailable,
    PropertySuggestions,
    Transport,
    suggest_properties,
)


class SuggestionRequest(Contract):
    object_hint: str | None = Field(default=None, max_length=2000)
    refresh: bool = False


class SuggestionsBusy(RuntimeError):
    pass


class SuggestionService:
    def __init__(self, store: JobStore, settings: Settings, transport: Transport | None = None):
        self.store = store
        self.settings = settings
        self.transport = transport
        self.inference_slot = BoundedSemaphore(1)

    def folder(self, job_id: UUID) -> Path:
        root = self.store.job_dir(job_id).resolve()
        folder = (root / "suggestions").resolve()
        if not folder.is_relative_to(root):
            raise ValueError("Suggestion files must remain inside the job directory")
        return folder

    def cached(self, job_id: UUID) -> dict | None:
        try:
            path = self.folder(job_id) / "gemini.json"
            if path.is_symlink():
                return None
            record = json.loads(path.read_text(encoding="utf-8"))
            PropertySuggestions.model_validate(record["suggestions"])
            return record
        except (OSError, ValueError, KeyError, TypeError):
            return None

    def matching_cache(
        self, job_id: UUID, request: SuggestionRequest
    ) -> PropertySuggestions | None:
        cached = self.cached(job_id)
        if (
            not request.refresh
            and cached is not None
            and cached.get("model") == self.settings.gemini_model
            and cached.get("object_hint") == request.object_hint
        ):
            return PropertySuggestions.model_validate(cached["suggestions"])
        return None

    def generate(self, job_id: UUID, request: SuggestionRequest) -> PropertySuggestions:
        cached = self.matching_cache(job_id, request)
        if cached is not None:
            return cached
        if not self.settings.gemini_api_key:
            raise GeminiUnavailable("Gemini is not configured")
        if not self.inference_slot.acquire(blocking=False):
            raise SuggestionsBusy
        try:
            # Another request may have finished between our initial read and claim.
            cached = self.matching_cache(job_id, request)
            if cached is not None:
                return cached
            paths = self.image_copies(job_id)
            result = suggest_properties(
                paths,
                request.object_hint,
                api_key=self.settings.gemini_api_key,
                model=self.settings.gemini_model,
                transport=self.transport,
            )
            record = {
                "model": self.settings.gemini_model,
                "object_hint": request.object_hint,
                "created_at": datetime.now(UTC).isoformat(),
                "suggestions": result.model_dump(mode="json"),
            }
            folder = self.folder(job_id)
            temporary = folder / "gemini.json.partial"
            temporary.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
            temporary.replace(folder / "gemini.json")
            return result
        finally:
            self.inference_slot.release()

    def image_copies(self, job_id: UUID) -> list[Path]:
        job = self.store.get(job_id)
        if not 1 <= len(job.source_images) <= 4:
            raise ValueError("The job requires one to four source images")
        root = self.store.job_dir(job_id).resolve()
        copies = []
        for index, relative in enumerate(job.source_images):
            source = (root / bundle_path(relative)).resolve(strict=True)
            if not source.is_relative_to(root) or not source.is_file():
                raise ValueError("Source image must remain inside the job directory")
            with Image.open(source) as original:
                if original.width * original.height > 25_000_000:
                    raise ValueError("Source image exceeds 25 MP")
                image = ImageOps.exif_transpose(original).convert("RGB")
                image.thumbnail((1024, 1024))
                folder = self.folder(job_id) / "images"
                folder.mkdir(parents=True, exist_ok=True)
                target = folder / f"{index:02}.jpg"
                image.save(target, format="JPEG", quality=90)
                copies.append(target)
        return copies
