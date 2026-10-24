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


class AssetProperties(Contract):
    dimensions_m: Dimensions
    mass_kg: ScalarProperty
    sliding_friction: ScalarProperty | None = None

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

    _portable_mesh = field_validator("visual_mesh")(bundle_path)


class JobError(Contract):
    code: str
    message: str


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
