"""Example-specific, explicit SO101 CAD/reference-template adapter.

Only this example script knows SO101; the review/preparation/export tools do not.
The original STEP inventory poses are retained in inventory.json. Their saved
assembly pose is replaced by reference-model placements at q=0, explicitly.
"""

import argparse
import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET

import numpy as np

from photo2sim.assemblies.contracts import Pose
from photo2sim.assemblies.review import ReviewProject, matrix_pose, pose_matrix, review_package

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--input-dir", type=Path, required=True)
parser.add_argument("--package", type=Path, required=True)
args = parser.parse_args()
source = ROOT / "third_party/robotstudio_so101"
manifest = json.loads((source / "SOURCE.json").read_text())
for name, item in manifest["files"].items():
    assert hashlib.sha256((source / name).read_bytes()).hexdigest() == item["sha256"]
reference = "Pinned Menagerie SO101 " + manifest["commit"]
inventory = json.loads((args.input_dir / "inventory.json").read_text())
comparison = json.loads((ROOT / "examples/so101/cad-review/report.json").read_text())
assert inventory["source_sha256"] == comparison["source_sha256"]
by_path = {p["cad_path"]: p for p in inventory["parts"]}
mesh_to_part = {
    row["model_mesh"].removesuffix(".stl"): by_path[row["cad_path"]]
    for row in comparison["comparisons"]
}
xml = ET.parse(source / "so101.xml").getroot()
parts, groups, joints = [], [], []


def pose(element):
    quat = np.array([float(v) for v in element.get("quat", "1 0 0 0").split()])
    quat /= np.linalg.norm(quat)
    return Pose(
        position_m=tuple(float(v) for v in element.get("pos", "0 0 0").split()),
        quaternion_wxyz=tuple(quat),
    )


def walk(body, parent=None, parent_frame=None):
    name = body.get("name")
    if name == "camera_mount":
        return  # Not identified in supplied STEP; omission explicit below.
    frame = pose_matrix(pose(body))
    if parent_frame is not None:
        frame = parent_frame @ frame
    else:
        frame[2, 3] += 0.05  # Demo root clearance, not measured mounting.
    inertial = body.find("inertial")
    groups.append(
        {
            "name": name,
            "frame": matrix_pose(frame),
            "mass_kg": {
                "value": float(inertial.get("mass")),
                "source": "sourced",
                "note": reference + " full-link mass; includes omitted servo geometry; unmeasured.",
            },
            "reviewed": False,
            "review_note": "Template grouping and pivot proposal; awaiting engineering inspection. "
            + reference,
        }
    )
    joint = body.find("joint")
    if joint is not None:
        joints.append(
            {
                "name": joint.get("name"),
                "parent": parent,
                "child": name,
                "kind": "revolute",
                "axis": [float(x) for x in joint.get("axis").split()],
                "limits_rad": [float(x) for x in joint.get("range").split()],
                "source": "sourced",
                "note": reference + " frame/axis/limits; hardware signs and zero unverified.",
                "damping": {
                    "value": 0.6,
                    "source": "sourced",
                    "note": reference
                    + " joint damping only; omitted armature/frictionloss/velocity gain.",
                },
                "drive": {
                    "kp": 998.22,
                    "force_limit_nm": 2.94,
                    "source": "sourced",
                    "note": reference
                    + " position/torque parameters; reduced actuator model, not identified hardware dynamics.",
                },
                "reviewed": False,
                "review_note": "Template proposal; not hardware calibration.",
            }
        )
    for geom in body.findall("geom"):
        mesh_name = geom.get("mesh")
        if geom.get("class") != "visual" or mesh_name not in mesh_to_part:
            continue
        item = mesh_to_part[mesh_name]
        parts.append(
            {
                "id": item["id"],
                "mesh": item["mesh"],
                "sha256": item["sha256"],
                "pose": matrix_pose(frame @ pose_matrix(pose(geom))),
                "source": "sourced",
                "note": item["note"]
                + "; placement/group from "
                + reference
                + "; saved CAD pose not used.",
                "group": name,
            }
        )
    for child in body.findall("body"):
        walk(child, name, frame)


walk(xml.find("worldbody/body"))
assert len(parts) == 11 and len(groups) == 7 and len(joints) == 6
project = ReviewProject.model_validate(
    {
        "name": "so101_cad_template",
        "synthetic": False,
        "root_link": "base",
        "parts": parts,
        "groups": groups,
        "joints": joints,
        "notes": [
            "CAD subset with imported reference-model articulation template. NOT photos-only reconstruction.",
            "Eleven nominal structural components from supplied STEP; 259 other leaves omitted, including 11 empty leaves. Servos, fasteners, electronics and camera geometry are not represented.",
            "All part placements and joint pivots at reference q=0 come from "
            + reference
            + ". Original STEP placements are preserved in inventory.json.",
            "Grouping is an explicit template proposal. CAD/source correspondence uses the earlier nominal local-frame comparison; there is no fitted scale or geometry deformation.",
            "Root clearance +0.05 m is assumed. Hardware zeros/signs, gripper 0-100 conversion, mounting, mass distribution and servo dynamics remain unverified.",
            "Masses are sourced full-link estimates including hardware whose visuals are omitted. Box collisions and uniform-box inertia remain approximations; generated dynamics may fail validation.",
            "Joint sliders and FK comparison verify conversion consistency with the same template, not independent physical accuracy.",
        ],
    }
)
with (args.input_dir / "project.json").open("x") as f:
    f.write(project.model_dump_json(indent=2) + "\n")
args.package.parent.mkdir(parents=True, exist_ok=True)
with args.package.open("x") as f:
    json.dump(review_package(project, args.input_dir), f)
print(
    json.dumps(
        {
            "parts": len(parts),
            "links": len(groups),
            "joints": len(joints),
            "package": str(args.package),
        }
    )
)
