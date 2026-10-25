"""Rigid target review stays separate from sizing, Gemini and numerical acceptance."""

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException

from photo2sim.api.rigid_history import retained_attempts
from photo2sim.api.store import JobConflict
from photo2sim.contracts import TargetReview, TargetReviewRequest


@dataclass(frozen=True)
class WholeGeometry:
    source_mesh_sha256: str
    geometry_context_sha256: str


def reviewed_geometry(job, source, *, properties=None, required=False, orientation=None):
    try:
        from photo2sim.assets.target import geometry_context, inspect_target, whole_geometry_context

        if properties and properties.geometry_scope == "whole_reconstruction":
            source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
            context = whole_geometry_context(source_hash, orientation or job.orientation)
            if (
                (
                    properties.source_mesh_sha256 is not None
                    and properties.source_mesh_sha256 != source_hash
                )
                or (
                    properties.geometry_context_sha256 is not None
                    and properties.geometry_context_sha256 != context
                )
                or (
                    required
                    and (
                        properties.geometry_context_sha256 != context
                        or properties.source_mesh_sha256 != source_hash
                        or properties.sizing is None
                    )
                )
            ):
                raise HTTPException(
                    409, "Source or orientation changed; preview and save full-mesh sizing again"
                )
            return WholeGeometry(source_hash, context)

        target = inspect_target(source)
        review = job.geometry_review
        if review is None:
            if required or (properties and properties.geometry_context_sha256):
                raise HTTPException(409, "Select and review the target geometry before processing")
            return target
        context = geometry_context(target.source_mesh_sha256, review.island_ids, job.orientation)
        if (
            target.source_mesh_sha256 != review.source_mesh_sha256
            or review.orientation != job.orientation
            or context != review.geometry_context_sha256
        ):
            raise HTTPException(
                409, "Source or orientation changed; review the target and sizing again"
            )
        target.select(review.island_ids)
        if properties:
            binding = properties.geometry_context_sha256
            if (required and binding != context) or (binding is not None and binding != context):
                raise HTTPException(
                    409, "Target changed; preview and save its reference correspondence again"
                )
        return target
    except ImportError:
        raise HTTPException(503, "Target review requires simulation dependencies") from None
    except (ValueError, OSError):
        raise HTTPException(
            422, "Saved source or selected surfaces are invalid; inspect geometry again"
        ) from None


def register_target_routes(app, store, get_job, job_source, editable):
    @app.get("/api/jobs/{job_id}/geometry")
    def inventory(job_id: UUID, preview: bool = False):
        job = get_job(job_id)
        try:
            from photo2sim.assets.target import inspect_target

            target = inspect_target(job_source(job))
            return target.inventory(preview=preview)
        except ImportError:
            raise HTTPException(503, "Target review requires simulation dependencies") from None
        except (ValueError, OSError):
            raise HTTPException(
                422, "Saved reconstruction is invalid; inspect the raw geometry"
            ) from None

    @app.patch("/api/jobs/{job_id}/geometry-review")
    def save_review(job_id: UUID, request: TargetReviewRequest):
        job = get_job(job_id)
        if not editable(job):
            raise HTTPException(
                409, "Target review requires awaiting input or a completed/failed simulation"
            )
        if request.expected_input_revision != job.input_revision:
            raise HTTPException(409, "Job inputs changed; reload before reviewing geometry")
        try:
            from photo2sim.assets.target import geometry_context, inspect_target

            target = inspect_target(job_source(job))
            if (
                request.source_mesh_sha256 != target.source_mesh_sha256
                or request.orientation != job.orientation
            ):
                raise HTTPException(
                    409, "Source or orientation changed; load the current target inventory"
                )
            target.select(request.island_ids)
        except ImportError:
            raise HTTPException(503, "Target review requires simulation dependencies") from None
        except (ValueError, OSError):
            raise HTTPException(
                422, "Select existing surfaces from the current source inventory"
            ) from None
        context = geometry_context(target.source_mesh_sha256, request.island_ids, job.orientation)
        review = TargetReview(
            **request.model_dump(exclude={"expected_input_revision"}),
            geometry_context_sha256=context,
            reviewed_at=datetime.now(UTC),
        )
        props = job.properties
        if props and (
            job.geometry_review is None or job.geometry_review.geometry_context_sha256 != context
        ):
            props = props.model_copy(update={"geometry_context_sha256": None})
        try:
            return store.update(
                job.id,
                expected_status=(job.status,),
                expected_input_revision=job.input_revision,
                input_revision=job.input_revision + 1,
                geometry_review=review,
                properties=props,
                sizing_result=None,
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
            raise HTTPException(
                409, "Job stage or inputs changed; reload before reviewing geometry"
            ) from None
