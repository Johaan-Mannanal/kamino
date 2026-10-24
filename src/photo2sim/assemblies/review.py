"""Guided, source-preserving rigid grouping in a shared reference frame."""

import hashlib
import json
import tempfile
from pathlib import Path
from typing import Annotated, Literal

import numpy as np
import trimesh
from pydantic import Field, field_validator, model_validator

from photo2sim.assemblies.contracts import AssemblyRecord, Joint, Name, Pose
from photo2sim.assemblies.export import local_mesh
from photo2sim.contracts import Contract, ScalarProperty, Source, bundle_path


class Part(Contract):
    id: Name
    mesh: str
    sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    pose: Pose = Field(default_factory=Pose)
    source: Source
    note: str
    group: Name | None = None
    excluded_reason: str | None = None

    _path = field_validator("mesh")(bundle_path)


class Group(Contract):
    name: Name
    frame: Pose = Field(default_factory=Pose)
    mass_kg: ScalarProperty
    sliding_friction: ScalarProperty | None = None
    reviewed: bool = False
    review_note: str = ""


class JointReview(Joint):
    reviewed: bool = False
    review_note: str = ""

    @model_validator(mode="after")
    def derived_origin(self):
        if self.origin != Pose():
            raise ValueError("Edit group frames; joint origins are derived, not supplied")
        return self


class ReviewProject(Contract):
    schema_version: Literal["assembly-review-1.0"] = "assembly-review-1.0"
    name: Name
    synthetic: bool
    root_link: Name
    parts: list[Part] = Field(min_length=1, max_length=2000)
    groups: list[Group] = Field(min_length=1, max_length=128)
    joints: list[JointReview] = Field(default_factory=list, max_length=127)
    notes: list[str] = Field(default_factory=list)
    review_snapshot: str | None = None

    @model_validator(mode="after")
    def unique_ids(self):
        for values in (
            [p.id for p in self.parts],
            [g.name for g in self.groups],
            [j.name for j in self.joints],
        ):
            if len(set(values)) != len(values):
                raise ValueError("Duplicate part, group or joint identifiers")
        names = {g.name for g in self.groups}
        if self.root_link not in names:
            raise ValueError("Root group missing")
        for part in self.parts:
            if part.group is not None and part.group not in names:
                raise ValueError("Part references unknown group")
            if part.group is not None and part.excluded_reason:
                raise ValueError("An assigned part cannot also be excluded")
        return self


def pose_matrix(pose: Pose) -> np.ndarray:
    result = trimesh.transformations.quaternion_matrix(pose.quaternion_wxyz)
    result[:3, 3] = pose.position_m
    return result


def matrix_pose(matrix: np.ndarray) -> dict:
    return {
        "position_m": matrix[:3, 3].tolist(),
        "quaternion_wxyz": trimesh.transformations.quaternion_from_matrix(matrix).tolist(),
    }


def checked_parts(project: ReviewProject, source: Path):
    result = {}
    for part in project.parts:
        path, mesh = local_mesh(source, part.mesh)
        if hashlib.sha256(path.read_bytes()).hexdigest() != part.sha256:
            raise ValueError(f"Source hash changed for part {part.id}; re-import and review")
        result[part.id] = mesh
    return result


def review_snapshot(project: ReviewProject) -> str:
    """Snapshot semantic inputs, excluding acknowledgement bookkeeping."""
    data = project.model_dump(mode="json", exclude={"review_snapshot"})
    for item in data["groups"] + data["joints"]:
        item["reviewed"] = False
        item["review_note"] = ""
    return json.dumps(data, sort_keys=True)


def assembly_record(project: ReviewProject) -> AssemblyRecord:
    """Gate export on explicit review and complete assignment, derive joint frames."""
    if not project.review_snapshot:
        raise ValueError("Missing review snapshot; acknowledge current inputs before preparation")
    saved = ReviewProject.model_validate_json(project.review_snapshot)
    if json.loads(review_snapshot(saved)) != json.loads(review_snapshot(project)):
        raise ValueError("Inputs changed since review; stale acknowledgements must be renewed")
    groups = {g.name: g for g in project.groups}
    for item in [*project.groups, *project.joints]:
        if not item.reviewed or not item.review_note.strip():
            raise ValueError(f"Review and annotate {item.name} before preparation")
    for p in project.parts:
        if p.group is None and not (p.excluded_reason or "").strip():
            raise ValueError(f"Assign or explicitly exclude part {p.id}")
    links = []
    for g in project.groups:
        parts = [p for p in project.parts if p.group == g.name]
        if not parts:
            raise ValueError(f"Group {g.name} has no geometry")
        sources = {p.source for p in parts}
        links.append(
            {
                "name": g.name,
                "visual_mesh": f"meshes/{g.name}.obj",
                "geometry_source": sources.pop() if len(sources) == 1 else "user_supplied",
                "geometry_note": "Grouped without deformation. "
                + " | ".join(f"{p.id} ({p.source}): {p.note}" for p in parts),
                "mass_kg": g.mass_kg,
                "sliding_friction": g.sliding_friction,
            }
        )
    joints = []
    for joint in project.joints:
        if joint.parent not in groups or joint.child not in groups:
            raise ValueError("Joint references missing group")
        relative = np.linalg.inv(pose_matrix(groups[joint.parent].frame)) @ pose_matrix(
            groups[joint.child].frame
        )
        data = joint.model_dump(exclude={"reviewed", "review_note", "origin"})
        data["origin"] = matrix_pose(relative)
        data["note"] = (joint.note or "") + " Review: " + joint.review_note
        joints.append(data)
    return AssemblyRecord.model_validate(
        {
            "name": project.name,
            "synthetic": project.synthetic,
            "root_link": project.root_link,
            "root_pose": groups[project.root_link].frame,
            "links": links,
            "joints": joints,
            "notes": project.notes
            + [
                "Guided grouping; review acknowledgements are engineering "
                "decisions, not physical measurement or accuracy certification."
            ],
        }
    )


def prepare_review(project: ReviewProject, source: Path, output_dir: Path) -> Path:
    project = ReviewProject.model_validate(project.model_dump())
    output = Path(output_dir).absolute()
    if output.exists() or output.is_symlink():
        raise FileExistsError("Output already exists; choose a new directory")
    record = assembly_record(project)
    meshes = checked_parts(project, Path(source))
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".photo2sim-group-", dir=output.parent) as temporary:
        stage = Path(temporary) / "prepared"
        (stage / "meshes").mkdir(parents=True)
        for group in project.groups:
            to_link = np.linalg.inv(pose_matrix(group.frame))
            members = []
            for part in project.parts:
                if part.group == group.name:
                    mesh = meshes[part.id].copy()
                    mesh.apply_transform(to_link @ pose_matrix(part.pose))
                    members.append(mesh)
            trimesh.util.concatenate(members).export(stage / f"meshes/{group.name}.obj")
        (stage / "assembly.json").write_text(record.model_dump_json(indent=2) + "\n")
        (stage / "review-project.json").write_text(project.model_dump_json(indent=2) + "\n")
        audit = {
            "schema_version": "grouping-1.0",
            "parts": {p.id: p.model_dump() for p in project.parts},
            "frames": {g.name: g.frame.model_dump() for g in project.groups},
            "note": "Source meshes are immutable. Prepared geometry uses inv(group frame) "
            "@ part pose. Excluded parts are not present in the simulator.",
        }
        (stage / "grouping.json").write_text(json.dumps(audit, indent=2) + "\n")
        if output.exists() or output.is_symlink():
            raise FileExistsError("Output appeared during preparation")
        stage.rename(output)
    return output / "assembly.json"


def review_package(project: ReviewProject, source: Path) -> dict:
    """Offline browser package; full source geometry, no external URLs or credentials."""
    project = ReviewProject.model_validate(project.model_dump())
    meshes = checked_parts(project, Path(source))
    for mesh in meshes.values():
        mesh.merge_vertices()  # Preview indexing only; source files and prepared geometry unchanged.
    return {
        "format": "photo2sim-review-package-1.0",
        "project": project.model_dump(),
        "geometry": {
            name: {
                "vertices": mesh.vertices.tolist(),
                "faces": mesh.faces.tolist(),
                "bounds_m": mesh.bounds.tolist(),
            }
            for name, mesh in meshes.items()
        },
    }
