"""Reviewed local link geometry and joints to a portable MJCF assembly."""

import hashlib
import json
import shutil
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

import mujoco
import numpy as np
import trimesh

from photo2sim.assemblies.contracts import AssemblyRecord
from photo2sim.contracts import bundle_path

TIMESTEP_S = 0.001


def numbers(values):
    return " ".join(format(float(x), ".17g") for x in values)


def local_mesh(root: Path, relative: str):
    path = (root / bundle_path(relative)).resolve(strict=True)
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError("Mesh must be a regular file inside the input directory")
    if path.suffix.lower() not in {".obj", ".stl"}:
        raise NotImplementedError("Prepare geometry-only OBJ/STL link meshes in metres")
    if path.suffix.lower() == ".obj":
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip().split(maxsplit=1)[:1] in (["mtllib"], ["usemtl"]):
                raise NotImplementedError(
                    "External materials are unsupported; use geometry-only OBJ"
                )
    mesh = trimesh.load_mesh(path, process=False)
    if not isinstance(mesh, trimesh.Trimesh) or len(mesh.vertices) < 4 or len(mesh.faces) < 4:
        raise ValueError("Expected a nonempty triangle mesh")
    if not np.isfinite(mesh.vertices).all() or not np.isfinite(mesh.area) or mesh.area <= 0:
        raise ValueError("Mesh has nonfinite or degenerate geometry")
    if not np.isfinite(mesh.extents).all() or np.any(mesh.extents <= 1e-8):
        raise ValueError("Mesh needs three positive bounding dimensions")
    return path, mesh


def export_assembly(
    record: AssemblyRecord,
    asset_dir: Path,
    output_dir: Path,
    *,
    collision_mode: str = "box",
    exclude_joint_pairs: bool = False,
) -> Path:
    """Generate a new fixed-root tree; preserve local mesh frames and reviewed inputs."""
    if collision_mode not in {"box", "convex_mesh"}:
        raise ValueError("Collision mode must be box or convex_mesh")
    if not isinstance(exclude_joint_pairs, bool):
        raise ValueError("exclude_joint_pairs must be boolean")
    # Revalidate even if a caller has mutated a nested Pydantic object.
    record = AssemblyRecord.model_validate(record.model_dump())
    output = Path(output_dir).absolute()
    if output.exists() or output.is_symlink():
        raise FileExistsError("Output already exists; choose a new directory")
    source_root = Path(asset_dir).resolve(strict=True)
    if source_root.is_relative_to(output.resolve()):
        raise ValueError("Output cannot contain the source directory")
    prepared = {link.name: local_mesh(source_root, link.visual_mesh) for link in record.links}
    assumptions = {
        "collision": (
            "per-link axis-aligned bounding boxes"
            if collision_mode == "box"
            else "per-link convex hull of visual mesh; concavities filled"
        ),
        "collision_mode": collision_mode,
        "exclude_joint_pairs": exclude_joint_pairs,
        "excluded_joint_pairs": [[j.parent, j.child] for j in record.joints]
        if exclude_joint_pairs
        else [],
        "inertia": "uniform solid cuboid at each mesh bounding-box centre; approximation",
        "root": "fixed to world at reviewed root_pose",
        "gravity_m_s2": [0, 0, -9.81],
        "timestep_s": TIMESTEP_S,
        "default_sliding_friction": 0.8,
        "torsional_friction": 0.005,
        "rolling_friction": 0.0001,
        "contact_solref": [0.02, 1],
        "parent_child_collision": (
            "Explicitly exclude directly joint-connected pairs, including fixed-root children; other contacts enabled"
            if exclude_joint_pairs
            else "MuJoCo native filtering; static-root children may collide with the root"
        ),
        "status": "load_checked_only; run articulated motion validation separately",
        "links": {},
    }
    root = ET.Element("mujoco", model=record.name)
    ET.SubElement(root, "compiler", angle="radian", inertiafromgeom="false", fusestatic="false")
    ET.SubElement(
        root, "option", timestep=str(TIMESTEP_S), gravity="0 0 -9.81", integrator="implicitfast"
    )
    assets = ET.SubElement(root, "asset")
    world = ET.SubElement(root, "worldbody")
    ET.SubElement(world, "light", pos="0 -1 2", dir="0 0 -1")
    ET.SubElement(
        world,
        "geom",
        name="ground",
        type="plane",
        size="0 0 .05",
        rgba=".3 .33 .36 1",
        friction=".8 .005 .0001",
    )
    if exclude_joint_pairs:
        contact = ET.SubElement(root, "contact")
        for j in record.joints:
            ET.SubElement(contact, "exclude", body1=j.parent, body2=j.child)
    actuators = ET.SubElement(root, "actuator")
    links = {link.name: link for link in record.links}
    children = {name: [] for name in links}
    for j in record.joints:
        children[j.parent].append(j)

    def add_link(name, parent, pose, joint=None):
        link = links[name]
        path, mesh = prepared[name]
        sides = mesh.extents
        centre = mesh.bounds.mean(axis=0)
        inertia = link.mass_kg.value * (np.sum(sides**2) - sides**2) / 12
        friction = link.sliding_friction.value if link.sliding_friction is not None else 0.8
        assumptions["links"][name] = {
            "bounds_m": mesh.bounds.tolist(),
            "mass_kg": link.mass_kg.value,
            "inertia_kg_m2": inertia.tolist(),
            "inertia_centre_m": centre.tolist(),
            "friction": [friction, 0.005, 0.0001],
            "sliding_friction_defaulted": link.sliding_friction is None,
            "source_mesh_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
        ET.SubElement(assets, "mesh", name=f"mesh_{name}", file=link.visual_mesh, scale="1 1 1")
        body = ET.SubElement(
            parent,
            "body",
            name=name,
            pos=numbers(pose.position_m),
            quat=numbers(pose.quaternion_wxyz),
        )
        ET.SubElement(
            body,
            "inertial",
            pos=numbers(centre),
            mass=str(link.mass_kg.value),
            diaginertia=numbers(inertia),
        )
        if joint is not None and joint.kind == "revolute":
            ET.SubElement(
                body,
                "joint",
                name=joint.name,
                type="hinge",
                pos="0 0 0",
                axis=numbers(joint.axis),
                limited="true",
                range=numbers(joint.limits_rad),
                damping=str(joint.damping.value),
            )
            ET.SubElement(
                actuators,
                "position",
                name=f"drive_{joint.name}",
                joint=joint.name,
                kp=str(joint.drive.kp),
                ctrllimited="true",
                ctrlrange=numbers(joint.limits_rad),
                forcelimited="true",
                forcerange=numbers([-joint.drive.force_limit_nm, joint.drive.force_limit_nm]),
            )
        ET.SubElement(
            body,
            "geom",
            name=f"visual_{name}",
            type="mesh",
            mesh=f"mesh_{name}",
            contype="0",
            conaffinity="0",
            group="2",
            mass="0",
            rgba=".1 .65 .85 1",
        )
        ET.SubElement(
            body,
            "geom",
            name=f"collision_{name}",
            **(
                {"type": "box", "pos": numbers(centre), "size": numbers(sides / 2)}
                if collision_mode == "box"
                else {"type": "mesh", "mesh": f"mesh_{name}"}
            ),
            group="3",
            friction=numbers([friction, 0.005, 0.0001]),
            solref=".02 1",
            rgba=".9 .35 .15 1",
        )
        for child in children[name]:
            add_link(child.child, body, child.origin, child)

    add_link(record.root_link, world, record.root_pose)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".photo2sim-assembly-", dir=output.parent) as temporary:
        stage = Path(temporary) / "bundle"
        (stage / "meshes").mkdir(parents=True)
        for name, (path, _) in prepared.items():
            target = stage / links[name].visual_mesh
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
        # Keep the reviewed record and its relative mesh paths intact.
        (stage / "assembly.json").write_text(
            record.model_dump_json(indent=2) + "\n", encoding="utf-8"
        )
        assumptions["exported_meshes"] = {name: link.visual_mesh for name, link in links.items()}
        (stage / "simulation.json").write_text(
            json.dumps(assumptions, indent=2) + "\n", encoding="utf-8"
        )
        ET.indent(root)
        ET.ElementTree(root).write(stage / "scene.xml", encoding="utf-8", xml_declaration=True)
        mujoco.MjModel.from_xml_path(str(stage / "scene.xml"))
        if output.exists() or output.is_symlink():
            raise FileExistsError("Output appeared during export; nothing overwritten")
        stage.rename(output)
    return output / "scene.xml"
