"""Versioned boundaries shared by the API, geometry, simulator, and interface."""

from datetime import datetime
from pathlib import PurePosixPath
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Source = Literal["measured", "user_supplied", "sourced", "estimated"]
ProviderName = Literal["mock", "meshy"]
JobStatus = Literal[
    "queued",
    "reconstructing",
    "awaiting_properties",
    "preparing",
    "validating",
    "completed",
    "failed",
]
Positive = Annotated[float, Field(gt=0, allow_inf_nan=False)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Orientation(Contract):
    """Active right-handed rotations about fixed X, then Y, then Z, in degrees."""

    x_deg: float = Field(default=0, ge=-180, le=180, allow_inf_nan=False, strict=True)
    y_deg: float = Field(default=0, ge=-180, le=180, allow_inf_nan=False, strict=True)
    z_deg: float = Field(default=0, ge=-180, le=180, allow_inf_nan=False, strict=True)


GeometryHash = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


class TargetSelection(Contract):
    source_mesh_sha256: GeometryHash
    island_ids: list[GeometryHash] = Field(min_length=1)
    orientation: Orientation
    review_note: str = Field(min_length=1, max_length=2000)
    acknowledge_geometry: bool = Field(strict=True)

    @model_validator(mode="after")
    def explicit_review(self):
        if not self.acknowledge_geometry or not self.review_note.strip():
            raise ValueError("Explicit target review and a meaningful review note are required")
        if len(set(self.island_ids)) != len(self.island_ids):
            raise ValueError("Duplicate surface islands are not allowed")
        return self


class TargetReviewRequest(TargetSelection):
    expected_input_revision: int = Field(ge=1)


class TargetReview(TargetSelection):
    algorithm: Literal["surface-islands-exact-seams-v1"] = "surface-islands-exact-seams-v1"
    geometry_context_sha256: GeometryHash
    reviewed_at: datetime
    state: Literal["user_reviewed_not_physically_verified"] = (
        "user_reviewed_not_physically_verified"
    )


def bundle_path(value: str) -> str:
    """Require a relative, forward-slash path independent of the host OS."""
    if (
        not value
        or "\\" in value
        or ":" in value
        or "\x00" in value
        or PurePosixPath(value).is_absolute()
        or any(part in ("", ".", "..") for part in value.split("/"))
    ):
        raise ValueError("Use a relative bundle path without traversal or drive letters")
    return value


class Dimensions(Contract):
    """Full bounding-box extents after orientation, in metres; never half extents."""

    x: Positive
    y: Positive
    z: Positive
    source: Source
    note: str | None = None


class ScalarProperty(Contract):
    value: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    source: Source
    note: str | None = None


class SizingReference(Contract):
    axis: Literal["x", "y", "z"]
    length: Annotated[float, Field(gt=0, allow_inf_nan=False, strict=True)]
    unit: Literal["mm", "m"]
    source: Source
    correspondence: Literal["full_mesh_extent"]
    description: str = Field(min_length=1, max_length=2000)

    @field_validator("description")
    @classmethod
    def meaningful_description(cls, value):
        if not value.strip():
            raise ValueError("Describe the full mesh extent, including any pins/protrusions")
        return value.strip()


class Sizing(Contract):
    mode: Literal["uniform", "independent_axes"]
    reviewed_orientation: Orientation
    reference: SizingReference | None = None
    acknowledge_distortion: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def explicit_mode(self):
        if self.mode == "uniform" and self.reference is None:
            raise ValueError("Uniform sizing requires a corresponding full mesh extent reference")
        if self.mode == "independent_axes":
            if not self.acknowledge_distortion or self.reference is not None:
                raise ValueError("Advanced stretching requires acknowledgement and no reference")
        return self


class SizingResult(Contract):
    mode: Literal["uniform", "independent_axes", "legacy_independent_axes"]
    orientation: Orientation
    source_extents_input_units: tuple[Positive, Positive, Positive]
    scale_factors: tuple[Positive, Positive, Positive]
    resulting_dimensions_m: Dimensions
    reference_extent_input_units: Positive | None = None
    geometry_review: Literal["reference_correspondence_user_supplied_not_verified"] = (
        "reference_correspondence_user_supplied_not_verified"
    )


class SizingPreviewRequest(Contract):
    geometry_scope: Literal["reviewed_target", "whole_reconstruction"] = "reviewed_target"
    geometry_context_sha256: GeometryHash | None = None
    sizing: Sizing
    orientation: Orientation
    dimensions_m: Dimensions | None = None


class AssetProperties(Contract):
    geometry_scope: Literal["reviewed_target", "whole_reconstruction"] = "reviewed_target"
    source_mesh_sha256: GeometryHash | None = None
    geometry_context_sha256: GeometryHash | None = None
    dimensions_m: Dimensions
    mass_kg: ScalarProperty
    sliding_friction: ScalarProperty | None = None
    # Missing in historical records: preserve their original three-axis behavior.
    sizing: Sizing | None = None

    @field_validator("mass_kg")
    @classmethod
    def positive_mass(cls, value: ScalarProperty) -> ScalarProperty:
        if value.value <= 0:
            raise ValueError("Mass must be positive")
        return value


class CollisionGeometry(Contract):
    kind: Literal["box", "convex_mesh"]
    mesh_path: str | None = None

    @field_validator("mesh_path")
    @classmethod
    def portable_path(cls, value: str | None) -> str | None:
        return bundle_path(value) if value is not None else None

    @model_validator(mode="after")
    def consistent_shape(self):
        if (self.kind == "convex_mesh") != (self.mesh_path is not None):
            raise ValueError("Only convex_mesh collision requires mesh_path")
        return self


class AssetRecord(Contract):
    schema_version: Literal["1.0"] = "1.0"
    asset_id: UUID
    visual_mesh: str
    properties: AssetProperties
    collision: CollisionGeometry
    synthetic: bool = False
    notes: list[str] = Field(default_factory=list)
    orientation: Orientation = Field(default_factory=Orientation)
    sizing_result: SizingResult | None = None
    geometry_review: TargetReview | None = None

    _portable_mesh = field_validator("visual_mesh")(bundle_path)


class JobError(Contract):
    code: str
    message: str


class RigidAttemptInputs(Contract):
    input_revision: int = Field(ge=1)
    properties: AssetProperties
    orientation: Orientation
    sizing_result: SizingResult | None = None
    geometry_review: TargetReview | None = None
    mesh_path: str
    source_mesh_sha256: str | None = None
    provider_task_id: str | None = None
    source_images: list[str] = Field(default_factory=list)
    provenance: Literal["processing_claim", "legacy_result_snapshot"] = "processing_claim"


class RigidAttempt(Contract):
    id: UUID
    status: JobStatus
    started_at: datetime
    finished_at: datetime | None = None
    inputs: RigidAttemptInputs
    inputs_path: str | None = None
    asset: AssetRecord | None = None
    export_path: str | None = None
    validation_path: str | None = None
    bundle_path: str | None = None
    error: JobError | None = None


class JobRecord(Contract):
    schema_version: Literal["1.0"] = "1.0"
    id: UUID
    status: JobStatus
    provider: ProviderName
    synthetic: bool
    created_at: datetime
    updated_at: datetime
    progress: Annotated[int, Field(ge=0, le=100)] = 0
    source_images: list[str] = Field(default_factory=list)
    provider_task_id: str | None = None
    mesh_path: str | None = None
    properties: AssetProperties | None = None
    asset: AssetRecord | None = None
    export_path: str | None = None
    validation_path: str | None = None
    bundle_path: str | None = None
    error: JobError | None = None
    orientation: Orientation = Field(default_factory=Orientation)
    sizing_result: SizingResult | None = None
    geometry_review: TargetReview | None = None
    input_revision: int = Field(default=1, ge=1)
    attempts: list[RigidAttempt] = Field(default_factory=list)
    active_attempt_id: UUID | None = None
    # Absent in old persisted records. New uploads must explicitly choose sizing.
    legacy_sizing_allowed: bool = True
