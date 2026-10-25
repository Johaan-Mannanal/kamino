"""Capture rigid-job inputs and preserve results from pre-attempt-index databases."""

from datetime import UTC, datetime
from uuid import uuid4

from photo2sim.contracts import JobRecord, RigidAttempt, RigidAttemptInputs


def attempt_inputs(job: JobRecord, *, source_hash=None, legacy=False):
    return RigidAttemptInputs(
        input_revision=job.input_revision,
        properties=job.asset.properties if legacy and job.asset else job.properties,
        orientation=job.asset.orientation if legacy and job.asset else job.orientation,
        sizing_result=job.asset.sizing_result if legacy and job.asset else job.sizing_result,
        mesh_path=job.mesh_path,
        source_mesh_sha256=source_hash,
        source_images=job.source_images,
        provider_task_id=job.provider_task_id,
        provenance="legacy_result_snapshot" if legacy else "processing_claim",
    )


def retained_attempts(job: JobRecord):
    """Keep legacy output pointers without rewriting their files or claiming old hashes."""
    if job.attempts or not job.export_path or not job.properties or not job.mesh_path:
        return job.attempts
    return [
        RigidAttempt(
            id=uuid4(),
            status=job.status,
            started_at=job.updated_at,
            finished_at=job.updated_at,
            inputs=attempt_inputs(job, legacy=True),
            asset=job.asset,
            export_path=job.export_path,
            validation_path=job.validation_path,
            bundle_path=job.bundle_path,
            error=job.error,
        )
    ]


def new_attempt(job: JobRecord, source_hash: str):
    attempt_id = uuid4()
    return RigidAttempt(
        id=attempt_id,
        status="preparing",
        started_at=datetime.now(UTC),
        inputs=attempt_inputs(job, source_hash=source_hash),
        # Publish this pointer only after the worker atomically saves the file.
        inputs_path=None,
    )
