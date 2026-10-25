"""Orchestrate cached reconstruction through preparation, physics and portable export."""

import hashlib
import json
import shutil
from pathlib import Path
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

import trimesh

from photo2sim.api.store import JobStore
from photo2sim.assets.prepare import prepare_asset
from photo2sim.contracts import JobError
from photo2sim.simulation.export import export_asset
from photo2sim.simulation.validate import validate_export


def process_job(store: JobStore, job_id: UUID) -> None:
    """A single atomically claimed job; failures preserve prior and partial artifacts."""
    stage = "preparation"
    snapshot_published = False
    try:
        job = store.get(job_id)
        root = store.job_dir(job_id).resolve()
        attempt_record = next(a for a in job.attempts if a.id == job.active_attempt_id)
        inputs = attempt_record.inputs
        attempt = root / "attempts" / str(attempt_record.id)
        attempt.mkdir(parents=True)
        snapshot_path = attempt / "inputs.json"
        snapshot_partial = attempt / "inputs.json.partial"
        snapshot_partial.write_text(inputs.model_dump_json(indent=2) + "\n", encoding="utf-8")
        snapshot_partial.replace(snapshot_path)
        attempt_record.inputs_path = snapshot_path.relative_to(root).as_posix()
        store.update(job_id, attempts=job.attempts)
        snapshot_published = True

        # Retain downloadable claimed inputs even if reconstruction disappears
        # or changes between the atomic claim and this worker's execution.
        source = (root / inputs.mesh_path).resolve(strict=True)
        if not source.is_relative_to(root):
            raise ValueError("Reconstruction must remain inside the job directory")
        if hashlib.sha256(source.read_bytes()).hexdigest() != inputs.source_mesh_sha256:
            raise ValueError("Source changed after processing claim")
        prepared = attempt / "prepared"
        asset = prepare_asset(source, prepared, inputs.properties, orientation=inputs.orientation)
        asset.synthetic = job.synthetic
        (prepared / "asset.json").write_text(
            asset.model_dump_json(indent=2) + "\n", encoding="utf-8"
        )
        store.update(job_id, asset=asset, sizing_result=asset.sizing_result)

        # Preserve the rich prepared bundle. The initial MuJoCo exporter accepts
        # geometry only, so remove visual attributes in a separate copy.
        stage = "export"
        geometry_dir = attempt / "simulation-input"
        visual = geometry_dir / asset.visual_mesh
        visual.parent.mkdir(parents=True)
        rich_mesh = trimesh.load_mesh(prepared / asset.visual_mesh, process=False)
        geometry = trimesh.Trimesh(
            vertices=rich_mesh.vertices, faces=rich_mesh.faces, process=False
        )
        geometry.export(visual, file_type="obj", digits=17)
        asset = asset.model_copy(
            update={
                "notes": [
                    *asset.notes,
                    "Simulation visual is a geometry-only copy; original reconstruction and prepared "
                    "materials are retained separately. No texture fidelity is claimed.",
                ]
            }
        )
        (geometry_dir / "asset.json").write_text(
            asset.model_dump_json(indent=2) + "\n", encoding="utf-8"
        )
        scene = export_asset(asset, geometry_dir, attempt / "bundle")
        shutil.copyfile(snapshot_path, scene.parent / "inputs.json")

        def relative(path: Path) -> str:
            return path.relative_to(root).as_posix()

        store.update(job_id, asset=asset, status="validating", export_path=relative(scene))
        stage = "validation"
        try:
            report = validate_export(scene)
        except Exception:
            report = {
                "passed": False,
                "viewer_inspected": False,
                "error": "Validation could not finish. The exported scene is retained for diagnosis.",
            }
        report_path = scene.parent / "validation-report.json"
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        store.update(job_id, validation_path=relative(report_path))
        if report.get("passed") is not True:
            store.update(
                job_id,
                status="failed",
                error=JobError(
                    code="validation_failed",
                    message="Simulation checks failed. Inspect the retained report and scene before retrying.",
                ),
            )
            return

        stage = "packaging"
        archive = attempt / "simulation.zip"
        temporary = attempt / "simulation.zip.partial"
        with ZipFile(temporary, "w", compression=ZIP_DEFLATED) as zipped:
            for path in sorted(scene.parent.rglob("*")):
                if path.is_file():
                    if path.is_symlink() or not path.resolve().is_relative_to(
                        scene.parent.resolve()
                    ):
                        raise ValueError("Bundle files must be local regular files")
                    zipped.write(path, path.relative_to(scene.parent).as_posix())
        temporary.rename(archive)
        store.update(job_id, status="completed", bundle_path=relative(archive), error=None)
    except Exception:
        # Do not publish raw library errors, which may embed paths or provider secrets.
        store.update(
            job_id,
            status="failed",
            error=JobError(
                code=f"{stage}_failed",
                message=(
                    "Attempt input snapshot could not be published. Inputs remain in job history; "
                    "prior artifacts are retained. Restore storage and retry simulation."
                    if not snapshot_published
                    else f"Simulation {stage} could not finish. Saved inputs and artifacts are retained."
                ),
            ),
        )
