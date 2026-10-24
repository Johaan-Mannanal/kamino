import shutil
import warnings
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from io import BytesIO
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError

from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.api.worker import JobWorker
from photo2sim.contracts import AssetProperties, JobRecord, bundle_path
from photo2sim.integrations.reconstruction import MockProvider, ReconstructionProvider


def create_app(
    settings: Settings | None = None, provider: ReconstructionProvider | None = None
) -> FastAPI:
    settings = settings or Settings.from_env()
    if provider is None:
        if settings.provider == "meshy":
            from photo2sim.integrations.meshy import MeshyProvider

            provider = MeshyProvider(settings)
        else:
            provider = MockProvider()
    if provider.name != settings.provider:
        raise ValueError("Provider implementation does not match configured provider")
    store = JobStore(settings.data_dir)

    @asynccontextmanager
    async def lifespan(app):
        worker = JobWorker(store, provider, settings)
        app.state.worker = worker
        worker.start()
        try:
            yield
        finally:
            worker.close()

    app = FastAPI(title="Photo2Sim", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Content-Type"],
    )

    def get_job(job_id: UUID) -> JobRecord:
        try:
            return store.get(job_id)
        except KeyError:
            raise HTTPException(404, "Job not found") from None

    @app.get("/api/health")
    def health():
        return {"status": "ok", "provider": provider.name}

    @app.post("/api/jobs", response_model=JobRecord, status_code=202)
    async def create_job(images: Annotated[list[UploadFile], File(min_length=1, max_length=4)]):
        validated = []
        for image in images:
            content = await image.read(settings.max_image_bytes + 1)
            if len(content) > settings.max_image_bytes:
                raise HTTPException(413, "Each image must be at most 10 MiB")
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("error", Image.DecompressionBombWarning)
                    with Image.open(BytesIO(content)) as decoded:
                        # Phone JPEGs may carry multi-picture (e.g. gain-map) metadata.
                        # MPO retains a JPEG primary image; preserve the original bytes.
                        extension = {"JPEG": "jpg", "MPO": "jpg", "PNG": "png", "WEBP": "webp"}.get(
                            decoded.format
                        )
                        if extension is None or decoded.width * decoded.height > 25_000_000:
                            raise ValueError("Unsupported format or image dimensions")
                        decoded.verify()
            except (
                UnidentifiedImageError,
                OSError,
                ValueError,
                SyntaxError,
                Image.DecompressionBombError,
                Image.DecompressionBombWarning,
            ):
                raise HTTPException(
                    422, "Provide valid JPEG, PNG, or WebP images up to 25 MP"
                ) from None
            validated.append((extension, content))
        job_id = uuid4()
        root = store.job_dir(job_id)
        now = datetime.now(UTC)
        source_images = [f"uploads/{index:02}.{ext}" for index, (ext, _) in enumerate(validated)]
        job = JobRecord(
            id=job_id,
            status="queued",
            provider=provider.name,
            synthetic=provider.name == "mock",
            source_images=source_images,
            created_at=now,
            updated_at=now,
        )
        try:
            (root / "uploads").mkdir(parents=True)
            for name, (_, content) in zip(source_images, validated, strict=True):
                (root / name).write_bytes(content)
            store.create(job)
        except Exception:
            shutil.rmtree(root, ignore_errors=True)
            raise
        app.state.worker.enqueue(job_id)
        return job

    @app.get("/api/jobs/{job_id}", response_model=JobRecord)
    def job_status(job_id: UUID):
        return get_job(job_id)

    @app.patch("/api/jobs/{job_id}/properties", response_model=JobRecord)
    def save_properties(job_id: UUID, properties: AssetProperties):
        if get_job(job_id).status != "awaiting_properties":
            raise HTTPException(409, "Properties can be edited only while awaiting_properties")
        return store.update(job_id, properties=properties)

    @app.get("/api/jobs/{job_id}/files/{path:path}")
    def download(job_id: UUID, path: str):
        get_job(job_id)
        try:
            bundle_path(path)
            root = store.job_dir(job_id).resolve()
            target = (root / path).resolve()
            if not target.is_relative_to(root) or not target.is_file():
                raise ValueError("Artifact not found")
        except ValueError:
            raise HTTPException(404, "Artifact not found") from None
        return FileResponse(target, filename=target.name)

    return app
