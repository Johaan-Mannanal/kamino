import hashlib
import shutil
import warnings
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from io import BytesIO
from secrets import compare_digest
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPBearer
from PIL import Image, UnidentifiedImageError

from photo2sim.api.config import Settings
from photo2sim.api.rigid_history import new_attempt, retained_attempts
from photo2sim.api.store import JobConflict, JobStore
from photo2sim.api.suggestions import (
    SuggestionRequest,
    SuggestionsBusy,
    SuggestionService,
    failure_details,
)
from photo2sim.api.worker import JobWorker
from photo2sim.contracts import (
    AssetProperties,
    JobRecord,
    Orientation,
    SizingPreviewRequest,
    bundle_path,
)
from photo2sim.integrations.gemini import GeminiUnavailable, PropertySuggestions, Transport
from photo2sim.integrations.reconstruction import MockProvider, ReconstructionProvider


def retryable_processing(job: JobRecord) -> bool:
    return (
        job.status == "failed"
        and job.error is not None
        and job.error.code
        in {
            "preparation_failed",
            "export_failed",
            "validation_failed",
            "packaging_failed",
            "processing_interrupted",
            "simulation_unavailable",
        }
    )


def create_app(
    settings: Settings | None = None,
    provider: ReconstructionProvider | None = None,
    *,
    gemini_transport: Transport | None = None,
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
    try:
        from photo2sim.api.assembly_jobs import AssemblyJobs, assembly_router
    except ModuleNotFoundError as exc:
        if exc.name not in {"mujoco", "numpy", "trimesh"}:
            raise
        assembly_jobs = None
    else:
        assembly_jobs = AssemblyJobs(settings.data_dir)
    suggestions = SuggestionService(store, settings, gemini_transport)

    @asynccontextmanager
    async def lifespan(app):
        worker = JobWorker(store, provider, settings)
        app.state.worker = worker
        worker.start()
        try:
            yield
        finally:
            worker.close()
            if assembly_jobs is not None:
                assembly_jobs.close()

    app = FastAPI(
        title="Kamino",
        version="0.1.0",
        lifespan=lifespan,
        dependencies=[Depends(HTTPBearer(auto_error=False))] if settings.api_token else [],
    )
    if settings.api_token:

        @app.middleware("http")
        async def application_access(request, call_next):
            if (
                request.method != "OPTIONS"
                and request.url.path.startswith("/api/")
                and request.url.path != "/api/health"
            ):
                scheme, _, token = request.headers.get("Authorization", "").partition(" ")
                if scheme.lower() != "bearer" or not compare_digest(
                    token.encode("utf-8"), settings.api_token.encode("utf-8")
                ):
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Application access token required"},
                        headers={"WWW-Authenticate": "Bearer"},
                    )
            return await call_next(request)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST", "PATCH", "PUT"],
        allow_headers=["Content-Type", "Authorization"],
    )
    if assembly_jobs is not None:
        app.include_router(
            assembly_router(assembly_jobs, settings.api_token, settings.max_asset_bytes)
        )

    def get_job(job_id: UUID) -> JobRecord:
        try:
            return store.get(job_id)
        except KeyError:
            raise HTTPException(404, "Job not found") from None

    def job_source(job):
        if not job.mesh_path:
            raise HTTPException(409, "Finish reconstruction before reviewing sizing")
        root = store.job_dir(job.id).resolve()
        try:
            source = (root / bundle_path(job.mesh_path)).resolve(strict=True)
            if not source.is_file() or not source.is_relative_to(root):
                raise ValueError("Source must remain inside the job")
            return source
        except (OSError, ValueError):
            raise HTTPException(422, "Saved reconstruction is unavailable or invalid") from None

    def resolve_job_sizing(job, properties, orientation):
        source = job_source(job)
        try:
            from photo2sim.assets.sizing import preview_sizing

            return preview_sizing(source, properties, orientation)
        except ImportError:
            raise HTTPException(503, "Sizing requires the simulation dependencies") from None
        except ValueError:
            raise HTTPException(
                422, "Review sizing and orientation; the reference or geometry is invalid"
            ) from None

    @app.post("/api/jobs/{job_id}/sizing-preview")
    def sizing_preview(job_id: UUID, request: SizingPreviewRequest):
        job = get_job(job_id)
        dims = request.dimensions_m or (job.properties.dimensions_m if job.properties else None)
        properties = AssetProperties(
            dimensions_m=dims or {"x": 1, "y": 1, "z": 1, "source": "estimated"},
            mass_kg={"value": 1, "source": "estimated", "note": "Preview placeholder, never saved"},
            sizing=request.sizing,
        )
        properties, result = resolve_job_sizing(job, properties, request.orientation)
        return {
            "dimensions_m": properties.dimensions_m.model_dump(mode="json"),
            "sizing_result": result.model_dump(mode="json"),
        }

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
            legacy_sizing_allowed=False,
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

    @app.get("/api/jobs/{job_id}/suggestions", response_model=PropertySuggestions)
    def cached_suggestions(job_id: UUID):
        get_job(job_id)
        cached = suggestions.cached(job_id)
        if cached is None:
            raise HTTPException(404, "No saved suggestions for this job")
        return PropertySuggestions.model_validate(cached["suggestions"])

    @app.post("/api/jobs/{job_id}/suggestions", response_model=PropertySuggestions)
    def property_suggestions(job_id: UUID, request: SuggestionRequest | None = None):
        get_job(job_id)
        try:
            return suggestions.generate(job_id, request or SuggestionRequest())
        except SuggestionsBusy:
            raise HTTPException(
                429, "Gemini is busy; retry shortly", headers={"Retry-After": "5"}
            ) from None
        except (ValueError, OSError):
            raise HTTPException(
                422, "Job images are unavailable or invalid; manual entry remains available"
            ) from None
        except GeminiUnavailable as error:
            return JSONResponse(status_code=503, content=failure_details(error.reason))
        except Exception:
            return JSONResponse(status_code=503, content=failure_details("provider"))

    @app.patch("/api/jobs/{job_id}/properties", response_model=JobRecord)
    def save_properties(job_id: UUID, properties: AssetProperties):
        job = get_job(job_id)
        if job.status not in {"awaiting_properties", "completed"} and not retryable_processing(job):
            raise HTTPException(409, "Properties require awaiting input or a failed simulation")
        if properties.sizing is None and not job.legacy_sizing_allowed:
            raise HTTPException(
                422, "Choose uniform sizing or explicitly acknowledge advanced stretching"
            )
        if job.status == "completed":
            job_source(job)
        sizing_result = None
        if properties.sizing is not None:
            properties, sizing_result = resolve_job_sizing(job, properties, job.orientation)
        try:
            return store.update(
                job_id,
                expected_status=(job.status,),
                expected_input_revision=job.input_revision,
                input_revision=job.input_revision + 1,
                properties=properties,
                legacy_sizing_allowed=job.legacy_sizing_allowed and properties.sizing is None,
                sizing_result=sizing_result,
                attempts=retained_attempts(job),
                active_attempt_id=None,
                status="awaiting_properties",
                error=None,
                asset=None,
                export_path=None,
                validation_path=None,
                bundle_path=None,
            )
        except JobConflict:
            raise HTTPException(409, "Job stage changed; reload its current status") from None

    @app.patch("/api/jobs/{job_id}/orientation", response_model=JobRecord)
    def save_orientation(job_id: UUID, orientation: Orientation):
        job = get_job(job_id)
        if job.status not in {"awaiting_properties", "completed"} and not retryable_processing(job):
            raise HTTPException(409, "Orientation requires awaiting input or a failed simulation")
        if job.status == "completed":
            job_source(job)
        try:
            return store.update(
                job_id,
                expected_status=(job.status,),
                expected_input_revision=job.input_revision,
                input_revision=job.input_revision + 1,
                sizing_result=None,
                attempts=retained_attempts(job),
                active_attempt_id=None,
                orientation=orientation,
                status="awaiting_properties",
                error=None,
                asset=None,
                export_path=None,
                validation_path=None,
                bundle_path=None,
            )
        except JobConflict:
            raise HTTPException(409, "Job stage changed; reload its current status") from None

    @app.post("/api/jobs/{job_id}/process", response_model=JobRecord, status_code=202)
    def process(job_id: UUID):
        job = get_job(job_id)
        if job.status != "awaiting_properties" and not retryable_processing(job):
            raise HTTPException(409, "Job is not ready for simulation processing")
        if job.properties is None or job.mesh_path is None:
            raise HTTPException(409, "Save confirmed properties and finish reconstruction first")
        if job.properties.sizing is not None:
            if job.properties.sizing.reviewed_orientation != job.orientation:
                raise HTTPException(409, "Orientation changed; review and save sizing again")
            # Recheck source dimensions before claiming the immutable attempt.
            resolve_job_sizing(job, job.properties, job.orientation)
        source = job_source(job)
        attempt = new_attempt(job, hashlib.sha256(source.read_bytes()).hexdigest())
        try:
            claimed = store.update(
                job_id,
                expected_status=(job.status,),
                expected_input_revision=job.input_revision,
                attempts=[*retained_attempts(job), attempt],
                active_attempt_id=attempt.id,
                status="preparing",
                error=None,
                asset=None,
                export_path=None,
                validation_path=None,
                bundle_path=None,
            )
        except JobConflict:
            raise HTTPException(409, "Job is already processing; reload its status") from None
        app.state.worker.enqueue_processing(job_id)
        return claimed

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
