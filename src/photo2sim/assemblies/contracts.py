"""Portable reviewed assembly data. Geometry is already in local link frames."""

import math
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from photo2sim.contracts import Contract, ScalarProperty, Source, bundle_path
from photo2sim.physics import PhysicsSettings

Finite = Annotated[float, Field(allow_inf_nan=False)]
Positive = Annotated[float, Field(gt=0, allow_inf_nan=False)]
StrictFinite = Annotated[float, Field(allow_inf_nan=False, strict=True)]
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
    force_limit_nm: Positive | None = None
    force_limit_n: Annotated[float, Field(gt=0, allow_inf_nan=False, strict=True)] | None = None
    source: Source
    note: str | None = None


class JointSpring(Contract):
    stiffness: Annotated[float, Field(ge=0, allow_inf_nan=False, strict=True)]
    rest: StrictFinite = 0
    source: Source
    note: str | None = None


class JointCoupling(Contract):
    driver_joint: Name
    ratio: StrictFinite = 1
    offset: StrictFinite = 0
    source: Source
    note: str | None = None


def joint_limits(joint):
    return joint.limits_m if joint.kind == "prismatic" else joint.limits_rad


def joint_force_limit(joint):
    return joint.drive.force_limit_n if joint.kind == "prismatic" else joint.drive.force_limit_nm


def validate_couplings(joints):
    by_name = {j.name: j for j in joints}
    visiting, visited = set(), set()

    def visit(j):
        if j.name in visiting:
            raise ValueError("Cycle in linked joint motion")
        if j.name in visited:
            return
        visiting.add(j.name)
        if j.coupling is not None:
            driver = by_name.get(j.coupling.driver_joint)
            if driver is None or driver.kind == "fixed" or driver.kind != j.kind:
                raise ValueError(
                    "Linked motion requires an existing driver of the same moving joint type"
                )
            visit(driver)
            mapped = [j.coupling.offset + j.coupling.ratio * v for v in joint_limits(driver)]
            lo, hi = joint_limits(j)
            if min(mapped) < lo - 1e-12 or max(mapped) > hi + 1e-12:
                raise ValueError("Linked motion exceeds follower limits across driver travel")
        visiting.remove(j.name)
        visited.add(j.name)

    for joint in joints:
        visit(joint)


class Link(Contract):
    name: Name
    visual_mesh: str
    geometry_source: Source
    geometry_note: str
    mass_kg: ScalarProperty
    sliding_friction: ScalarProperty | None = None
    physics: PhysicsSettings | None = None

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
    kind: Literal["fixed", "revolute", "prismatic"]
    origin: Pose = Field(default_factory=Pose)
    axis: Vector3 | None = None
    limits_rad: tuple[Finite, Finite] | None = None
    limits_m: tuple[StrictFinite, StrictFinite] | None = None
    spring: JointSpring | None = None
    coupling: JointCoupling | None = None
    damping: ScalarProperty | None = None
    drive: PositionDrive | None = None
    source: Source
    note: str | None = None

    @model_validator(mode="after")
    def joint_parameters(self):
        parameters = (
            self.axis,
            self.limits_rad,
            self.limits_m,
            self.damping,
            self.drive,
            self.spring,
            self.coupling,
        )
        if self.kind == "fixed":
            if any(p is not None for p in parameters):
                raise ValueError("Fixed joints cannot specify moving joint parameters")
        else:
            limits = joint_limits(self)
            if self.axis is None or limits is None or self.damping is None:
                raise ValueError("Moving joints require axis, limits and damping")
            if (
                self.kind == "prismatic"
                and self.limits_rad is not None
                or self.kind == "revolute"
                and self.limits_m is not None
            ):
                raise ValueError("Joint limits must use the units of the joint type")
            if not math.isclose(sum(x * x for x in self.axis), 1, abs_tol=1e-6):
                raise ValueError("Joint axis must have unit length")
            lo, hi = limits
            if not lo < hi or not lo <= 0 <= hi:
                raise ValueError("Joint limits must be ordered and contain the reference q=0")
            if self.coupling is not None:
                if self.drive is not None:
                    raise ValueError("Linked followers cannot have a competing position drive")
            elif self.drive is None:
                raise ValueError("Independent moving joints require a position drive")
            if self.drive is not None:
                correct = (
                    self.drive.force_limit_n
                    if self.kind == "prismatic"
                    else self.drive.force_limit_nm
                )
                incorrect = (
                    self.drive.force_limit_nm
                    if self.kind == "prismatic"
                    else self.drive.force_limit_n
                )
                if correct is None or incorrect is not None:
                    raise ValueError("Slider force limits use N; hinge torque limits use Nm")
            if self.spring is not None and not lo <= self.spring.rest <= hi:
                raise ValueError("Spring rest must lie within joint travel")
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
        validate_couplings(self.joints)
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
