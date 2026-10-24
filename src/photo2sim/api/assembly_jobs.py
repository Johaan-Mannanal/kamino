"""Persistent guided assembly jobs, using the existing review/export library."""

import hashlib
import json
import shutil
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from secrets import compare_digest
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from photo2sim.assemblies.contracts import AssemblyRecord
from photo2sim.assemblies.draft import draft_from_meshes
from photo2sim.assemblies.export import export_assembly
from photo2sim.assemblies.review import (
    ReviewProject,
    assembly_record,
    checked_parts,
    prepare_review,
    review_package,
)
from photo2sim.assemblies.validate import validate_assembly
from photo2sim.contracts import bundle_path


def now():
    return datetime.now(UTC).isoformat()


class RevisionRequest(BaseModel):
    expected_revision: int = Field(ge=1)
    project: ReviewProject


class ProcessRequest(BaseModel):
    expected_revision: int = Field(ge=1)
    collision_mode: Literal["box", "convex_mesh"] = "box"
    exclude_joint_pairs: bool = False


class AssemblyJobs:
    def __init__(self, data_dir: Path):
        self.root = data_dir.resolve() / "assemblies"
        self.lock = threading.RLock()
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="assembly")
        for path in self.root.glob("*/job.json"):
            job = json.loads(path.read_text(encoding="utf-8"))
            if job["status"] in {"preparing", "exporting", "validating"}:
                job["status"] = "failed"
                job["error"] = {
                    "code": "processing_interrupted",
                    "message": "Server restarted; retry the saved revision.",
                }
                job["attempts"][-1].update(status="failed", error=job["error"])
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
            return json.loads(path.read_text(encoding="utf-8"))

    def update(self, job_id: UUID, **changes):
        with self.lock:
            job = self.get(job_id)
            job.update(changes, updated_at=now())
            self.write(job)
            return job

    def create(
        self,
        project: ReviewProject,
        uploads: dict[str, bytes],
        originals: dict[str, bytes] | None = None,
    ):
        job_id = uuid4()
        root = self.directory(job_id)
        root.mkdir(parents=True)
        try:
            for name, data in (originals or {}).items():
                target = root / "originals" / bundle_path(name)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            for name, data in uploads.items():
                target = root / "sources" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            package = review_package(project, root / "sources")
            revision = root / "revisions/0001"
            revision.mkdir(parents=True)
            (revision / "project.json").write_text(
                project.model_dump_json(indent=2) + "\n", encoding="utf-8"
            )
            (revision / "package.json").write_text(json.dumps(package) + "\n", encoding="utf-8")
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
            shutil.rmtree(root)
            raise

    def save(self, job_id: UUID, project: ReviewProject, expected_revision: int):
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
            package = review_package(project, root / "sources")
            number = expected_revision + 1
            folder = root / "revisions" / f"{number:04d}"
            # job.json is the publication point. A crash may leave the next
            # revision unreferenced; retain it separately before retrying.
            if folder.exists():
                retained = root / "interrupted-revisions"
                retained.mkdir(exist_ok=True)
                folder.rename(retained / f"{number:04d}-{uuid4().hex}")
            staging = root / "revisions" / f".pending-{uuid4().hex}"
            staging.mkdir()
            (staging / "project.json").write_text(
                project.model_dump_json(indent=2) + "\n", encoding="utf-8"
            )
            (staging / "package.json").write_text(json.dumps(package) + "\n", encoding="utf-8")
            staging.rename(folder)
            return self.update(
                job_id,
                revision=number,
                status="awaiting_review",
                project_path=f"revisions/{number:04d}/project.json",
                package_path=f"revisions/{number:04d}/package.json",
                export_generated=False,
                motion_validation_passed=None,
                export_path=None,
                validation_path=None,
                bundle_path=None,
                error=None,
            )

    def start(self, job_id: UUID, request: ProcessRequest):
        with self.lock:
            job = self.get(job_id)
            if job["revision"] != request.expected_revision or job["status"] not in {
                "awaiting_review",
                "failed",
            }:
                raise RuntimeError("Job changed or is processing; reload before retrying")
            root = self.directory(job_id)
            project = ReviewProject.model_validate_json(
                (root / job["project_path"]).read_text(encoding="utf-8")
            )
            assembly_record(project)
            checked_parts(project, root / "sources")
            attempt = len(job["attempts"]) + 1
            job["attempts"].append(
                {
                    "number": attempt,
                    "revision": request.expected_revision,
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
            self.executor.submit(self.process, job_id, attempt, project, request)
            return job

    def stage(self, job_id: UUID, status: str, **values):
        with self.lock:
            job = self.get(job_id)
            job["attempts"][-1].update(status=status, **values)
            self.update(job_id, status=status, attempts=job["attempts"], **values)

    def process(self, job_id: UUID, attempt: int, project: ReviewProject, request: ProcessRequest):
        root = self.directory(job_id)
        folder = root / "attempts" / f"{attempt:04d}"
        try:
            folder.mkdir(parents=True)
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
            export_path = scene.relative_to(root).as_posix()
            self.stage(job_id, "validating", export_generated=True, export_path=export_path)
            report = validate_assembly(scene)
            report_path = folder / "bundle/validation.json"
            report_path.write_text(
                json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8"
            )
            validation_path = report_path.relative_to(root).as_posix()
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
            archive = folder / "simulation.zip"
            with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as zipped:
                for tree, prefix in (
                    (folder / "bundle", ""),
                    (folder / "prepared", "prepared"),
                    (root / "sources", "sources"),
                    (root / "originals", "originals"),
                ):
                    for path in tree.rglob("*"):
                        if path.is_file():
                            zipped.write(path, (Path(prefix) / path.relative_to(tree)).as_posix())
            self.stage(
                job_id,
                "completed",
                motion_validation_passed=True,
                validation_path=validation_path,
                bundle_path=archive.relative_to(root).as_posix(),
            )
        except Exception as exc:
            code = "preparation_failed" if not (folder / "prepared").exists() else "export_failed"
            if (folder / "bundle/scene.xml").exists():
                code = "validation_failed"
            details = {"code": code, "message": f"Assembly processing failed: {type(exc).__name__}"}
            report = folder / "bundle/validation.json"
            if code == "validation_failed" and not report.exists():
                report.write_text(
                    json.dumps({"passed": False, "error": details}, indent=2) + "\n",
                    encoding="utf-8",
                )
                self.stage(
                    job_id,
                    "failed",
                    motion_validation_passed=False,
                    validation_path=report.relative_to(root).as_posix(),
                    error=details,
                )
            else:
                self.stage(job_id, "failed", error=details)


def assembly_router(service: AssemblyJobs, api_token: str, max_bytes: int):
    def authorize(request: Request):
        if api_token:
            scheme, _, token = request.headers.get("Authorization", "").partition(" ")
            if scheme.lower() != "bearer" or not compare_digest(token.encode(), api_token.encode()):
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
                data = await mesh.read(max_bytes + 1)
                total += len(data)
                if len(data) > max_bytes or total > 200 * 1024 * 1024:
                    raise HTTPException(413, "Mesh upload limit exceeded")
                uploads[filename] = data
            project, normalized = draft_from_meshes(name, uploads, units, synthetic)
            return service.create(project, normalized, originals=uploads)
        except (ValueError, OSError) as exc:
            raise HTTPException(422, str(exc)) from None

    @router.post("", status_code=202)
    async def create(project: UploadFile = File(...), meshes: list[UploadFile] = File(...)):
        content = await project.read(2 * 1024 * 1024 + 1)
        if len(content) > 2 * 1024 * 1024:
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
                data = await mesh.read(max_bytes + 1)
                total += len(data)
                if len(data) > max_bytes or total > 200 * 1024 * 1024:
                    raise HTTPException(413, "Mesh upload limit exceeded")
                uploads[name] = data
            if set(uploads) != paths:
                raise ValueError("A source mesh is missing")
            for part in parsed.parts:
                if hashlib.sha256(uploads[part.mesh]).hexdigest() != part.sha256:
                    raise ValueError(f"Source hash mismatch for {part.id}")
            return service.create(parsed, uploads)
        except HTTPException:
            raise
        except (ValueError, OSError) as exc:
            raise HTTPException(422, str(exc)) from None

    @router.get("/{job_id}")
    def get(job_id: UUID):
        return find(job_id)

    @router.put("/{job_id}/revisions", status_code=201)
    def save(job_id: UUID, body: RevisionRequest):
        find(job_id)
        try:
            return service.save(job_id, body.project, body.expected_revision)
        except RuntimeError as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.post("/{job_id}/process", status_code=202)
    def process(job_id: UUID, body: ProcessRequest):
        find(job_id)
        try:
            return service.start(job_id, body)
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

    return router
