"""Portable reviewed assembly data. Geometry is already in local link frames."""

import math
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from photo2sim.contracts import Contract, ScalarProperty, Source, bundle_path

Finite = Annotated[float, Field(allow_inf_nan=False)]
Positive = Annotated[float, Field(gt=0, allow_inf_nan=False)]
Name = Annotated[str, Field(pattern=r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")]
Vector3 = tuple[Finite, Finite, Finite]


class Pose(Contract):
    """Child-to-parent rigid transform at joint q=0; scalar-first quaternion."""

    position_m: Vector3 = (0, 0, 0)
    quaternion_wxyz: tuple[Finite, Finite, Finite, Finite] = (1, 0, 0, 0)

    @field_validator("quaternion_wxyz")
    @classmethod
    def unit_quaternion(cls, value):
        if not math.isclose(sum(x * x for x in value), 1, abs_tol=1e-6):
            raise ValueError("Quaternion must have unit length")
        return value


class PositionDrive(Contract):
    kp: Positive
    force_limit_nm: Positive
    source: Source
    note: str | None = None


class Link(Contract):
    name: Name
    visual_mesh: str
    geometry_source: Source
    geometry_note: str
    mass_kg: ScalarProperty
    sliding_friction: ScalarProperty | None = None

    _path = field_validator("visual_mesh")(bundle_path)

    @field_validator("mass_kg")
    @classmethod
    def positive_mass(cls, value):
        if value.value <= 0:
            raise ValueError("Mass must be positive")
        return value


class Joint(Contract):
    name: Name
    parent: Name
    child: Name
    kind: Literal["fixed", "revolute"]
    origin: Pose = Field(default_factory=Pose)
    axis: Vector3 | None = None
    limits_rad: tuple[Finite, Finite] | None = None
    damping: ScalarProperty | None = None
    drive: PositionDrive | None = None
    source: Source
    note: str | None = None

    @model_validator(mode="after")
    def joint_parameters(self):
        parameters = (self.axis, self.limits_rad, self.damping, self.drive)
        if self.kind == "fixed":
            if any(p is not None for p in parameters):
                raise ValueError("Fixed joints cannot specify hinge parameters")
        else:
            if any(p is None for p in parameters):
                raise ValueError("Revolute joints require axis, limits, damping and position drive")
            if not math.isclose(sum(x * x for x in self.axis), 1, abs_tol=1e-6):
                raise ValueError("Joint axis must have unit length")
            lo, hi = self.limits_rad
            if not lo < hi or not lo <= 0 <= hi:
                raise ValueError("Joint limits must be ordered and contain the reference q=0")
        return self


class AssemblyRecord(Contract):
    schema_version: Literal["assembly-1.0"] = "assembly-1.0"
    name: Name
    synthetic: bool
    root_link: Name
    root_pose: Pose = Field(default_factory=Pose)
    links: list[Link] = Field(min_length=1, max_length=128)
    joints: list[Joint] = Field(default_factory=list, max_length=127)
    notes: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def connected_tree(self):
        names = [link.name for link in self.links]
        if len(set(names)) != len(names):
            raise ValueError("Duplicate link names")
        if self.root_link not in names:
            raise ValueError("Root link is missing")
        joint_names = [joint.name for joint in self.joints]
        if len(set(joint_names)) != len(joint_names):
            raise ValueError("Duplicate joint names")
        parents = {}
        for j in self.joints:
            if j.parent not in names or j.child not in names:
                raise ValueError("Joint references missing link")
            if j.child == self.root_link or j.parent == j.child:
                raise ValueError("Root cannot have a parent; self joints are invalid")
            if j.child in parents:
                raise ValueError("A link cannot have multiple parents")
            parents[j.child] = j.parent
        for name in names:
            visited = set()
            while name != self.root_link:
                if name in visited:
                    raise ValueError("Cycle in assembly graph")
                visited.add(name)
                if name not in parents:
                    raise ValueError("Every link must connect to the root")
                name = parents[name]
        return self
