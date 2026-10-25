"""Shared explicit SI physics settings for rigid bodies and assembly links.

Omission preserves the historical exporter assumptions. These numerical presets
are not measured material properties. MuJoCo 3.3.7 semantics:
https://mujoco.readthedocs.io/en/3.3.7/modeling.html#solver-parameters
https://mujoco.readthedocs.io/en/3.3.7/computation/index.html#contact
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Finite = Annotated[float, Field(allow_inf_nan=False, strict=True)]
Positive = Annotated[float, Field(gt=0, allow_inf_nan=False, strict=True)]
Vector3 = tuple[Finite, Finite, Finite]
Positive3 = tuple[Positive, Positive, Positive]
Source = Literal["measured", "user_supplied", "sourced", "estimated"]


class PhysicsContract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PhysicsScalar(PhysicsContract):
    """Torsional and rolling friction coefficients have units of metres."""

    value: Annotated[float, Field(ge=0, allow_inf_nan=False, strict=True)]
    source: Source
    note: str | None = None


class CollisionSettings(PhysicsContract):
    kind: Literal["box", "convex_hull"] = "box"
    # Full extents and local body-frame offset, in metres after mesh sizing.
    box_size_m: Positive3 | None = None
    offset_m: Vector3 = (0, 0, 0)

    @model_validator(mode="after")
    def relevant_size(self):
        if self.kind == "convex_hull" and self.box_size_m is not None:
            raise ValueError("box_size_m applies only to box collision")
        return self


class InertiaSettings(PhysicsContract):
    """Diagonal inertia about COM, axes aligned with the local body frame."""

    mode: Literal["automatic", "manual"] = "automatic"
    center_of_mass_m: Vector3 = (0, 0, 0)
    diagonal_kg_m2: Positive3 | None = None
    source: Source = "estimated"
    note: str | None = None

    @model_validator(mode="after")
    def physical_diagonal(self):
        if self.mode == "manual":
            if self.diagonal_kg_m2 is None:
                raise ValueError("Manual inertia requires Ixx, Iyy, Izz in kg*m^2")
            moments = self.diagonal_kg_m2
            if any(moments[i] > sum(moments[j] for j in range(3) if j != i) for i in range(3)):
                raise ValueError(
                    "Inertia must satisfy Ixx <= Iyy+Izz and all triangle inequalities"
                )
        elif self.diagonal_kg_m2 is not None or any(self.center_of_mass_m):
            raise ValueError(
                "Automatic inertia uses the collision box centre; use manual for custom COM"
            )
        return self


class ContactSettings(PhysicsContract):
    compliance: Literal["firm", "soft"] = "firm"
    response: Literal["low", "medium", "high"] = "low"
    source: Source = "estimated"
    note: str | None = None


class PhysicsSettings(PhysicsContract):
    collision: CollisionSettings | None = None
    torsional_friction: PhysicsScalar | None = None
    rolling_friction: PhysicsScalar | None = None
    inertia: InertiaSettings | None = None
    contact: ContactSettings | None = None


def numbers(values):
    return " ".join(format(float(value), ".17g") for value in values)


def collision_parameters(physics, dimensions):
    import numpy as np

    collision = physics.collision if physics else None
    size = collision.box_size_m if collision and collision.box_size_m else dimensions
    return (
        collision.kind if collision else "box",
        np.asarray(size, dtype=float),
        np.asarray(collision.offset_m if collision else (0, 0, 0), dtype=float),
    )


def friction_parameters(physics, sliding, legacy_spin=0.005, legacy_roll=0.0001):
    import numpy as np

    spin = physics.torsional_friction if physics else None
    roll = physics.rolling_friction if physics else None
    friction = np.array(
        [
            sliding,
            legacy_spin if spin is None else spin.value,
            legacy_roll if roll is None else roll.value,
        ],
        dtype=float,
    )
    # Historical nonzero spin/roll coefficients were inactive at condim=3.
    condim = (
        6
        if roll is not None and roll.value > 0
        else 4
        if spin is not None and spin.value > 0
        else 3
    )
    # condim=6 also enables twist. Do not silently activate its historically
    # inactive default when only rolling resistance was requested.
    if condim == 6 and spin is None:
        friction[1] = 0
    return friction, condim


def contact_attributes(physics):
    if physics is None:
        return {}
    attrs = {}
    if physics.torsional_friction is not None or physics.rolling_friction is not None:
        attrs["priority"] = "1"
    if physics.contact is not None:
        settings = physics.contact
        time_constant = 0.002 if settings.compliance == "firm" else 0.02
        damping_ratio = {"low": 1.0, "medium": 0.7, "high": 0.4}[settings.response]
        attrs.update(
            priority="1",
            solref=numbers([time_constant, damping_ratio]),
            solimp=numbers(
                [0.9, 0.95, 0.001, 0.5, 2]
                if settings.compliance == "firm"
                else [0.7, 0.9, 0.003, 0.5, 2]
            ),
        )
    return attrs


def inertia_parameters(physics, mass, dimensions):
    import numpy as np

    inertia = physics.inertia if physics else None
    if inertia is not None and inertia.mode == "manual":
        return np.asarray(inertia.center_of_mass_m), np.asarray(inertia.diagonal_kg_m2)
    _, sides, offset = collision_parameters(physics, dimensions)
    # Uniform solid bounding cuboid approximation, including for convex collision.
    # Keep this explicit: reconstruction geometry does not establish mass density.
    return offset, float(mass) * (np.sum(sides**2) - sides**2) / 12
