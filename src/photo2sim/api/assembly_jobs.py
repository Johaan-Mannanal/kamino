"""Persistent guided assembly jobs, using the existing review/export library."""

import hashlib
import json
import shutil
import tempfile
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from photo2sim.api.job_access import require_legacy_claim
from photo2sim.api.mesh_import import MeshImportBusy, MeshImportError, import_meshes, review_import
from photo2sim.api.storage import StorageBudget, StorageLimitError
from photo2sim.assemblies.contracts import AssemblyRecord
from photo2sim.assemblies.export import export_assembly
from photo2sim.assemblies.mapping_review import validate_mapping_review
from photo2sim.assemblies.review import (
    ReviewProject,
    assembly_record,
    prepare_review,
    review_package,
)
from photo2sim.assemblies.validate import validate_assembly
from photo2sim.contracts import bundle_path

MAX_REVISIONS = 50
MAX_MAPPING_VERSIONS = 50
MAX_ATTEMPTS = 30
MAX_REVIEW_BYTES = 2 * 1024**2
MAX_MAPPING_BYTES = 8 * 1024**2
PROCESSING_SCRATCH_RESERVE = 64 * 1024**2


def now():
    return datetime.now(UTC).isoformat()


class RevisionRequest(BaseModel):
    expected_revision: int = Field(ge=1)
    project: ReviewProject


class ProcessRequest(BaseModel):
    expected_revision: int = Field(ge=1)
    expected_mapping_version: int = Field(default=0, ge=0)
    collision_mode: Literal["box", "convex_mesh"] = "box"
    exclude_joint_pairs: bool = False


class AssemblyJobs:
    def __init__(self, data_dir: Path, storage: StorageBudget | None = None):
        self.data_dir = data_dir.resolve()
        self.root = self.data_dir / "assemblies"
        self.storage = storage or StorageBudget(self.data_dir)
        self.lock = threading.RLock()
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="assembly")
        for path in self.root.glob("*/job.json"):
            job = json.loads(path.read_text(encoding="utf-8"))
            migrated = False
            for key, value in (
                ("mapping_review_path", None),
                ("mapping_version", 0),
                ("owner_principal_id", None),
                ("owner_claimed_at", None),
            ):
                if key not in job:
                    job[key] = value
                    migrated = True
            if job["status"] in {"preparing", "exporting", "validating"}:
                job["status"] = "failed"
                job["error"] = {
                    "code": "processing_interrupted",
                    "message": "Server restarted; retry the saved revision.",
                }
                job["attempts"][-1].update(status="failed", error=job["error"])
                self.write(job)
            elif migrated:
                self.write(job)

    def close(self):
        self.executor.shutdown(wait=True)

    def directory(self, job_id: UUID):
        return self.root / str(job_id)

    def write(self, job: dict):
        path = self.directory(UUID(job["id"])) / "job.json"
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(job, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)

    def get(self, job_id: UUID):
        with self.lock:
            path = self.directory(job_id) / "job.json"
            if not path.is_file():
                raise KeyError(job_id)
            job = json.loads(path.read_text(encoding="utf-8"))
            job.setdefault("mapping_review_path", None)
            job.setdefault("mapping_version", 0)
            return job

    def update(self, job_id: UUID, **changes):
        with self.lock:
            job = self.get(job_id)
            job.update(changes, updated_at=now())
            self.write(job)
            return job

    def claim_owner(self, job_id: UUID, owner_principal_id: str | None):
        """Explicit privileged recovery for an unowned pre-ownership job only."""
        if not owner_principal_id:
            raise RuntimeError("A browser ownership cookie is required for recovery")
        with self.lock:
            job = self.get(job_id)
            if job.get("owner_principal_id") is not None:
                raise RuntimeError("This job already has a browser owner")
            return self.update(
                job_id, owner_principal_id=owner_principal_id, owner_claimed_at=now()
            )

    def create(
        self,
        project: ReviewProject,
        uploads: dict[str, bytes],
        originals: dict[str, bytes] | None = None,
        package: dict | None = None,
        owner_principal_id: str | None = None,
    ):
        job_id = uuid4()
        root = self.directory(job_id)
        root.mkdir(parents=True)
        try:
            if package is None:
                # API callers supply an importer-produced package.  This fallback preserves
                # the service's existing direct callers without changing their semantics.
                with tempfile.TemporaryDirectory(prefix="kamino-review-") as temporary:
                    source = self._temporary_sources(Path(temporary), uploads)
                    package = review_package(project, source)
            project_bytes = (project.model_dump_json(indent=2) + "\n").encode()
            package_bytes = (json.dumps(package, allow_nan=False) + "\n").encode()
            retained_bytes = (
                sum(map(len, uploads.values()))
                + sum(map(len, (originals or {}).values()))
                + len(project_bytes)
                + len(package_bytes)
                + 16 * 1024
            )
            with self.storage.write_admission(root, retained_bytes):
                for name, data in (originals or {}).items():
                    target = root / "originals" / bundle_path(name)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                for name, data in uploads.items():
                    target = root / "sources" / bundle_path(name)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                revision = root / "revisions/0001"
                revision.mkdir(parents=True)
                (revision / "project.json").write_bytes(project_bytes)
                (revision / "package.json").write_bytes(package_bytes)
                job = {
                    "schema_version": "assembly-job-1.0",
                    "id": str(job_id),
                    "name": project.name,
                    "synthetic": project.synthetic,
                    "status": "awaiting_review",
                    "created_at": now(),
                    "updated_at": now(),
                    "revision": 1,
                    "project_path": "revisions/0001/project.json",
                    "package_path": "revisions/0001/package.json",
                    "mapping_review_path": None,
                    "mapping_version": 0,
                    "owner_principal_id": owner_principal_id,
                    "owner_claimed_at": now() if owner_principal_id else None,
                    "export_generated": False,
                    "motion_validation_passed": None,
                    "export_path": None,
                    "validation_path": None,
                    "bundle_path": None,
                    "error": None,
                    "attempts": [],
                }
                self.write(job)
            return job
        except Exception:
            shutil.rmtree(root, ignore_errors=True)
            raise

    @staticmethod
    def _temporary_sources(root: Path, uploads: dict[str, bytes]) -> Path:
        sources = root / ".review-sources"
        for name, data in uploads.items():
            target = sources / bundle_path(name)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        return sources

    def save(
        self,
        job_id: UUID,
        project: ReviewProject,
        expected_revision: int,
        package: dict | None = None,
    ):
        with self.lock:
            job = self.get(job_id)
            if job["revision"] != expected_revision or job["status"] in {
                "preparing",
                "exporting",
                "validating",
            }:
                raise RuntimeError("Job changed; reload before saving")
            root = self.directory(job_id)
            original = ReviewProject.model_validate_json(
                (root / "revisions/0001/project.json").read_text(encoding="utf-8")
            )

            def identity(p):
                return [
                    (part.id, part.mesh, part.sha256, part.pose, part.source, part.note)
                    for part in p.parts
                ]

            if identity(original) != identity(project) or original.synthetic != project.synthetic:
                raise ValueError(
                    "Source paths, hashes, poses, provenance and synthetic label are immutable; import a new job"
                )
            number = expected_revision + 1
            if number > MAX_REVISIONS:
                raise StorageLimitError(
                    "Revision retention limit reached; prior revisions remain available"
                )
            if package is None:
                package = review_package(project, root / "sources")
            folder = root / "revisions" / f"{number:04d}"
            # job.json is the publication point. A crash may leave the next
            # revision unreferenced; retain it separately before retrying.
            if folder.exists():
                retained = root / "interrupted-revisions"
                retained.mkdir(exist_ok=True)
                folder.rename(retained / f"{number:04d}-{uuid4().hex}")
            project_bytes = (project.model_dump_json(indent=2) + "\n").encode()
            package_bytes = (json.dumps(package, allow_nan=False) + "\n").encode()
            with self.storage.write_admission(root, len(project_bytes) + len(package_bytes) + 4096):
                staging = root / "revisions" / f".pending-{uuid4().hex}"
                staging.mkdir()
                (staging / "project.json").write_bytes(project_bytes)
                (staging / "package.json").write_bytes(package_bytes)
                staging.rename(folder)
            return self.update(
                job_id,
                revision=number,
                status="awaiting_review",
                project_path=f"revisions/{number:04d}/project.json",
                package_path=f"revisions/{number:04d}/package.json",
                # Mapping reviews bind the previous project snapshot.  Keep the
                # old evidence on disk but never point a new revision at it.
                mapping_review_path=None,
                mapping_version=0,
                export_generated=False,
                motion_validation_passed=None,
                export_path=None,
                validation_path=None,
                bundle_path=None,
                error=None,
            )

    def save_mapping_review(
        self,
        job_id: UUID,
        expected_revision: int,
        expected_mapping_version: int,
        review: dict,
    ):
        with self.lock:
            job = self.get(job_id)
            if (
                job["revision"] != expected_revision
                or job.get("mapping_version", 0) != expected_mapping_version
            ):
                raise RuntimeError("Job changed; reload before saving")
            if job["status"] in {"preparing", "exporting", "validating"}:
                raise RuntimeError("Job is processing; reload before saving")
            root = self.directory(job_id)
            project = ReviewProject.model_validate_json(
                (root / job["project_path"]).read_text(encoding="utf-8")
            )
            validate_mapping_review(review, project)
            version = expected_mapping_version + 1
            if version > MAX_MAPPING_VERSIONS:
                raise StorageLimitError(
                    "Mapping-review retention limit reached; prior reviews remain available"
                )
            relative = f"revisions/{job['revision']:04d}/mapping-review-{version:04d}.json"
            target = root / relative
            # This is immutable evidence.  A version collision can only mean a
            # corrupted publication state; never replace it.
            if target.exists():
                raise RuntimeError("Mapping review version already exists; reload before saving")
            encoded = json.dumps(
                review, ensure_ascii=False, separators=(",", ":"), allow_nan=False
            ).encode()
            if len(encoded) > MAX_MAPPING_BYTES:
                raise StorageLimitError("Mapping review exceeds the retained metadata limit")
            with self.storage.write_admission(root, len(encoded) + 4096):
                target.write_bytes(encoded)
            return self.update(job_id, mapping_review_path=relative, mapping_version=version)

    def start(self, job_id: UUID, request: ProcessRequest):
        with self.lock:
            job = self.get(job_id)
            mapping_path = job.get("mapping_review_path")
            mapping_version = job.get("mapping_version", 0)
            completed_with_new_mapping = (
                job["status"] == "completed"
                and mapping_path is not None
                and bool(job["attempts"])
                and job["attempts"][-1].get("revision") == request.expected_revision
                and job["attempts"][-1].get("mapping_version", 0) != mapping_version
            )
            if (
                job["revision"] != request.expected_revision
                or mapping_version != request.expected_mapping_version
                or (
                    job["status"] not in {"awaiting_review", "failed"}
                    and not completed_with_new_mapping
                )
            ):
                raise RuntimeError("Job changed or is processing; reload before retrying")
            root = self.directory(job_id)
            project = ReviewProject.model_validate_json(
                (root / job["project_path"]).read_text(encoding="utf-8")
            )
            assembly_record(project)
            # Import/revision review already validated the geometry in a bounded child.
            # Recheck immutable source identity here without running a native parser
            # before the processing claim. Preparation validates geometry in the worker.
            source_root = (root / "sources").resolve(strict=True)
            if not source_root.is_relative_to(root.resolve()):
                raise ValueError("Source directory must remain inside the job")
            verified = {}
            for part in project.parts:
                if part.mesh in verified:
                    if verified[part.mesh] != part.sha256:
                        raise ValueError("Conflicting source hashes")
                    continue
                path = (source_root / bundle_path(part.mesh)).resolve(strict=True)
                if not path.is_relative_to(source_root) or not path.is_file():
                    raise ValueError("Source must remain inside the job")
                with path.open("rb") as stream:
                    actual = hashlib.file_digest(stream, "sha256").hexdigest()
                if actual != part.sha256:
                    raise ValueError("Source changed; re-import and review")
                verified[part.mesh] = actual
            attempt = len(job["attempts"]) + 1
            if attempt > MAX_ATTEMPTS:
                raise StorageLimitError(
                    "Attempt retention limit reached; prior exports remain available"
                )
            mapping_bytes = (root / mapping_path).read_bytes() if mapping_path else None
            project_bytes = (root / job["project_path"]).read_bytes()
            job["attempts"].append(
                {
                    "number": attempt,
                    "revision": request.expected_revision,
                    "mapping_review_path": mapping_path,
                    "mapping_version": mapping_version,
                    "status": "preparing",
                    "started_at": now(),
                    "export_generated": False,
                    "motion_validation_passed": None,
                    "export_path": None,
                    "validation_path": None,
                    "bundle_path": None,
                    "error": None,
                    "export_config": {
                        "collision_mode": request.collision_mode,
                        "exclude_joint_pairs": request.exclude_joint_pairs,
                    },
                }
            )
            job = self.update(
                job_id,
                status="preparing",
                attempts=job["attempts"],
                error=None,
                export_generated=False,
                motion_validation_passed=None,
                export_path=None,
                validation_path=None,
                bundle_path=None,
            )
            self.executor.submit(
                self.process, job_id, attempt, project, request, project_bytes, mapping_bytes
            )
            return job

    def stage(self, job_id: UUID, status: str, **values):
        with self.lock:
            job = self.get(job_id)
            job["attempts"][-1].update(status=status, **values)
            self.update(job_id, status=status, attempts=job["attempts"], **values)

    def process(
        self,
        job_id: UUID,
        attempt: int,
        project: ReviewProject,
        request: ProcessRequest,
        project_bytes: bytes,
        mapping_bytes: bytes | None,
    ):
        root = self.directory(job_id)
        destination = root / "attempts" / f"{attempt:04d}"
        temporary_root = Path(tempfile.mkdtemp(prefix="kamino-assembly-pending-", dir=root))
        folder = temporary_root / "attempt"
        try:
            # Generation writes only into a private, same-volume scratch directory.  This
            # preflight preserves the configured free-space reserve before native exporters
            # create temporary output; final retained bytes are admitted again at publication.
            with self.storage.write_admission(root, PROCESSING_SCRATCH_RESERVE):
                pass
            folder.mkdir()
            prepared = prepare_review(project, root / "sources", folder / "prepared")
            self.stage(job_id, "exporting")
            record = AssemblyRecord.model_validate_json(prepared.read_text(encoding="utf-8"))
            scene = export_assembly(
                record,
                prepared.parent,
                folder / "bundle",
                collision_mode=request.collision_mode,
                exclude_joint_pairs=request.exclude_joint_pairs,
            )
            # Capture the immutable inputs before validation.  Failed attempts
            # retain these snapshots too, while later saves cannot rewrite them.
            evidence = folder / "evidence"
            evidence.mkdir()
            (evidence / "reviewed-project.json").write_bytes(project_bytes)
            if mapping_bytes is not None:
                (evidence / "mapping-review.json").write_bytes(mapping_bytes)
            replay = Path(__file__).resolve().parents[1] / "assemblies" / "observation_replay.py"
            if mapping_bytes is not None and not replay.is_file():
                raise FileNotFoundError("Observation replay runner is unavailable")
            if replay.is_file():
                shutil.copyfile(replay, evidence / "replay_observations.py")
            report = validate_assembly(scene)
            report_path = folder / "bundle/validation.json"
            report_path.write_text(
                json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8"
            )
            if report["passed"]:
                archive = folder / "simulation.zip"
                with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as zipped:
                    for tree, prefix in (
                        (folder / "bundle", ""),
                        (folder / "prepared", "prepared"),
                        (root / "sources", "sources"),
                        (root / "originals", "originals"),
                        (folder / "evidence", ""),
                    ):
                        if not tree.is_dir():
                            continue
                        for path in tree.rglob("*"):
                            if path.is_file():
                                zipped.write(
                                    path, (Path(prefix) / path.relative_to(tree)).as_posix()
                                )
            # No status exposes files until the complete immutable attempt has passed
            # storage admission and has been atomically published.
            folder = self.storage.publish_directory(folder, destination, root)
            export_path = (folder / "bundle" / "scene.xml").relative_to(root).as_posix()
            validation_path = (folder / "bundle" / "validation.json").relative_to(root).as_posix()
            self.stage(job_id, "validating", export_generated=True, export_path=export_path)
            if not report["passed"]:
                self.stage(
                    job_id,
                    "failed",
                    motion_validation_passed=False,
                    validation_path=validation_path,
                    error={
                        "code": "validation_failed",
                        "message": "Motion validation failed; inspect the retained report and export.",
                    },
                )
                return
            self.stage(
                job_id,
                "completed",
                motion_validation_passed=True,
                validation_path=validation_path,
                bundle_path=(folder / "simulation.zip").relative_to(root).as_posix(),
            )
        except Exception as exc:
            code = "preparation_failed" if not (folder / "prepared").exists() else "export_failed"
            if (folder / "bundle/scene.xml").exists():
                code = "validation_failed"
            if isinstance(exc, StorageLimitError):
                code = "storage_budget_exhausted"
            details = {"code": code, "message": f"Assembly processing failed: {type(exc).__name__}"}
            report = folder / "bundle/validation.json"
            if code == "validation_failed" and not report.exists():
                report.write_text(
                    json.dumps({"passed": False, "error": details}, indent=2) + "\n",
                    encoding="utf-8",
                )
            if code == "validation_failed" and folder.is_dir() and not destination.exists():
                try:
                    folder = self.storage.publish_directory(folder, destination, root)
                    self.stage(
                        job_id,
                        "failed",
                        motion_validation_passed=False,
                        validation_path=(folder / "bundle/validation.json")
                        .relative_to(root)
                        .as_posix(),
                        error=details,
                    )
                    return
                except (StorageLimitError, OSError, ValueError):
                    details = {
                        "code": "storage_budget_exhausted",
                        "message": "Assembly processing failed before a retained attempt could be published.",
                    }
            self.stage(job_id, "failed", error=details)
        finally:
            shutil.rmtree(temporary_root, ignore_errors=True)


def assembly_router(service: AssemblyJobs, settings, max_bytes: int):
    def authorize(request: Request):
        if settings.api_token:
            from photo2sim.api.browser_session import access_role

            if access_role(request, settings) is None:
                raise HTTPException(
                    401, "Application access token required", headers={"WWW-Authenticate": "Bearer"}
                )

    router = APIRouter(prefix="/api/assembly-jobs", dependencies=[Depends(authorize)])

    def find(job_id: UUID):
        try:
            return service.get(job_id)
        except KeyError:
            raise HTTPException(404, "Assembly job not found") from None

    @router.post("/from-meshes", status_code=202)
    async def from_meshes(
        request: Request,
        name: str = Form(...),
        units: Literal["m", "mm"] = Form(...),
        synthetic: bool = Form(False),
        meshes: list[UploadFile] = File(...),
    ):
        if not 1 <= len(meshes) <= 128:
            raise HTTPException(422, "Select between 1 and 128 component meshes")
        uploads, total = {}, 0
        try:
            for mesh in meshes:
                filename = mesh.filename or ""
                if filename.casefold() in {n.casefold() for n in uploads}:
                    raise ValueError("Duplicate mesh filenames; give each part a unique filename")
                data = await mesh.read(min(max_bytes, 32 * 1024 * 1024) + 1)
                total += len(data)
                if (
                    len(data) > max_bytes
                    or len(data) > 32 * 1024 * 1024
                    or total > 64 * 1024 * 1024
                ):
                    raise HTTPException(413, "Mesh upload limit exceeded")
                uploads[filename] = data
            project, normalized, originals, package = await run_in_threadpool(
                import_meshes, name, uploads, units, synthetic
            )
            return await run_in_threadpool(
                service.create,
                project,
                normalized,
                originals,
                package,
                getattr(request.state, "owner_principal_id", None),
            )
        except MeshImportBusy as exc:
            raise HTTPException(429, str(exc), headers={"Retry-After": "5"}) from None
        except StorageLimitError:
            raise HTTPException(
                413, "Storage budget exhausted. Saved exports remain available."
            ) from None
        except MeshImportError as exc:
            status = 413 if "limit" in str(exc).lower() else 422
            raise HTTPException(status, str(exc)) from None
        except (ValueError, OSError) as exc:
            raise HTTPException(422, str(exc)) from None

    @router.post("", status_code=202)
    async def create(
        request: Request, project: UploadFile = File(...), meshes: list[UploadFile] = File(...)
    ):
        content = await project.read(MAX_REVIEW_BYTES + 1)
        if len(content) > MAX_REVIEW_BYTES:
            raise HTTPException(413, "Review project exceeds 2 MiB")
        try:
            parsed = ReviewProject.model_validate_json(content)
            paths = {part.mesh for part in parsed.parts}
            if any(Path(path).suffix.lower() not in {".obj", ".stl"} for path in paths):
                raise ValueError(
                    "Only individual OBJ/STL meshes are accepted; archives are not expanded"
                )
            if len(meshes) != len(paths):
                raise ValueError("Upload one mesh per distinct project path")
            uploads = {}
            total = 0
            for mesh in meshes:
                name = mesh.filename or ""
                bundle_path(name)
                if name not in paths or name in uploads:
                    raise ValueError("Mesh filename must match a distinct project path exactly")
                data = await mesh.read(min(max_bytes, 32 * 1024 * 1024) + 1)
                total += len(data)
                if (
                    len(data) > max_bytes
                    or len(data) > 32 * 1024 * 1024
                    or total > 64 * 1024 * 1024
                ):
                    raise HTTPException(413, "Mesh upload limit exceeded")
                uploads[name] = data
            if set(uploads) != paths:
                raise ValueError("A source mesh is missing")
            for part in parsed.parts:
                if hashlib.sha256(uploads[part.mesh]).hexdigest() != part.sha256:
                    raise ValueError(f"Source hash mismatch for {part.id}")
            package = await run_in_threadpool(review_import, parsed, uploads)
            return await run_in_threadpool(
                service.create,
                parsed,
                uploads,
                None,
                package,
                getattr(request.state, "owner_principal_id", None),
            )
        except HTTPException:
            raise
        except MeshImportBusy as exc:
            raise HTTPException(429, str(exc), headers={"Retry-After": "5"}) from None
        except StorageLimitError:
            raise HTTPException(
                413, "Storage budget exhausted. Saved exports remain available."
            ) from None
        except MeshImportError as exc:
            status = 413 if "limit" in str(exc).lower() else 422
            raise HTTPException(status, str(exc)) from None
        except (ValueError, OSError) as exc:
            raise HTTPException(422, str(exc)) from None

    @router.get("/{job_id}")
    def get(job_id: UUID):
        return find(job_id)

    @router.put("/{job_id}/revisions", status_code=201)
    async def save(job_id: UUID, body: RevisionRequest):
        find(job_id)
        try:
            root = service.directory(job_id)
            uploads = {
                part.mesh: (root / "sources" / bundle_path(part.mesh)).read_bytes()
                for part in body.project.parts
            }
            package = await run_in_threadpool(review_import, body.project, uploads)
            return service.save(job_id, body.project, body.expected_revision, package=package)
        except MeshImportBusy as exc:
            raise HTTPException(429, str(exc), headers={"Retry-After": "5"}) from None
        except MeshImportError as exc:
            status = 413 if "limit" in str(exc).lower() else 422
            raise HTTPException(status, str(exc)) from None
        except StorageLimitError:
            raise HTTPException(
                413, "Storage budget exhausted. Saved exports remain available."
            ) from None
        except RuntimeError as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.put("/{job_id}/mapping-review")
    async def save_mapping_review(job_id: UUID, request: Request):
        find(job_id)
        content = await request.body()
        if len(content) > MAX_MAPPING_BYTES:
            raise HTTPException(413, "Mapping review exceeds 50 MiB")
        try:
            body = json.loads(content)
            if not isinstance(body, dict):
                raise ValueError("Mapping review request must be an object")
            revision = body.get("expected_revision")
            version = body.get("expected_mapping_version")
            review = body.get("review")
            if (
                not isinstance(revision, int)
                or isinstance(revision, bool)
                or revision < 1
                or not isinstance(version, int)
                or isinstance(version, bool)
                or version < 0
                or not isinstance(review, dict)
            ):
                raise ValueError("Invalid mapping review request")
            return service.save_mapping_review(job_id, revision, version, review)
        except json.JSONDecodeError:
            raise HTTPException(422, "Mapping review must be valid JSON") from None
        except StorageLimitError:
            raise HTTPException(
                413, "Storage budget exhausted. Saved exports remain available."
            ) from None
        except RuntimeError as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.post("/{job_id}/process", status_code=202)
    def process(job_id: UUID, body: ProcessRequest):
        find(job_id)
        try:
            return service.start(job_id, body)
        except StorageLimitError:
            raise HTTPException(
                413, "Storage budget exhausted. Saved exports remain available."
            ) from None
        except RuntimeError as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.get("/{job_id}/files/{path:path}")
    def download(job_id: UUID, path: str):
        find(job_id)
        try:
            bundle_path(path)
            root = service.directory(job_id).resolve()
            target = (root / path).resolve()
            if not target.is_relative_to(root) or not target.is_file() or target.name == "job.json":
                raise ValueError("File not found")
            current = root
            for component in Path(path).parts:
                current /= component
                if current.is_symlink():
                    raise ValueError("File not found")
        except ValueError:
            raise HTTPException(404, "File not found") from None
        return FileResponse(target, filename=target.name)

    @router.post("/{job_id}/claim")
    async def claim(job_id: UUID, request: Request):
        from photo2sim.api.browser_session import access_role

        if access_role(request, settings) != "team":
            raise HTTPException(403, "Team access is required for legacy recovery")
        await require_legacy_claim(request)
        find(job_id)
        try:
            return service.claim_owner(job_id, getattr(request.state, "owner_principal_id", None))
        except RuntimeError as exc:
            raise HTTPException(409, str(exc)) from None

    return router
