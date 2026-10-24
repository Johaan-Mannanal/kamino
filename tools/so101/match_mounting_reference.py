"""Match the operator's shoulder reference face; nominal CAD, no model mutation."""

import argparse
import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET

import cadquery as cq
import matplotlib
import numpy as np
import trimesh
from cadquery.occ_impl.importers.assembly import _get_name
from OCP.IFSelect import IFSelect_RetDone
from OCP.Interface import Interface_Static
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDF import TDF_Label, TDF_LabelSequence
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFDoc import XCAFDoc_DocumentTool

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def transform(element):
    q = np.array([float(v) for v in element.get("quat", "1 0 0 0").split()])
    matrix = trimesh.transformations.quaternion_matrix(q)
    matrix[:3, 3] = [float(v) for v in element.get("pos", "0 0 0").split()]
    return matrix


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--step", type=Path, required=True)
    parser.add_argument("--bundle-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    assert sha(args.step) == "f754be35708382b05ce65768ae33c612f91dca11ad19d14807dc637eb944ba3d"
    args.output_dir.mkdir(parents=True, exist_ok=False)
    reader = STEPCAFControl_Reader()
    reader.SetNameMode(True)
    Interface_Static.SetCVal_s("xstep.cascade.unit", "MM")
    assert reader.ReadFile(str(args.step)) == IFSelect_RetDone
    doc = TDocStd_Document(TCollection_ExtendedString("XmlXCAF"))
    assert reader.Transfer(doc)
    shapes = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    roots = TDF_LabelSequence()
    shapes.GetFreeShapes(roots)
    found = []

    def walk(label):
        if shapes.IsReference_s(label):
            ref = TDF_Label()
            assert shapes.GetReferredShape_s(label, ref)
            walk(ref)
        elif shapes.IsAssembly_s(label):
            children = TDF_LabelSequence()
            shapes.GetComponents_s(label, children)
            for i in range(1, children.Length() + 1):
                walk(children.Value(i))
        elif _get_name(label) == "Rotation_Pitch_SO101 v8":
            found.append(cq.Shape.cast(shapes.GetShape_s(label)))

    for i in range(1, roots.Length() + 1):
        walk(roots.Value(i))
    assert len(found) == 1
    shape = found[0]
    matches = [
        (i, f)
        for i, f in enumerate(shape.Faces())
        if f.geomType() == "PLANE"
        and abs(f.Center().y - 56.4) < 1e-8
        and abs(f.Area() - 317.698080185) < 1e-5
    ]
    assert len(matches) == 1
    index, face = matches[0]
    center = np.array(face.Center().toTuple())
    circles = []
    for edge in face.Edges():
        if edge.geomType() == "CIRCLE":
            circle = edge._geomAdaptor().Circle()
            value = {"center_mm": list(circle.Location().Coord()), "radius_mm": circle.Radius()}
            if not any(
                np.allclose(value["center_mm"], c["center_mm"])
                and np.isclose(value["radius_mm"], c["radius_mm"])
                for c in circles
            ):
                circles.append(value)
    holes = [c for c in circles if c["radius_mm"] < 3]
    assert len(holes) == 5  # Four off-center fastener cutouts and a central hole.
    reference = ROOT / "third_party/robotstudio_so101/so101.xml"
    manifest = json.loads((reference.parent / "SOURCE.json").read_text())
    assert sha(reference) == manifest["files"]["so101.xml"]["sha256"]
    xml = ET.parse(reference).getroot()
    shoulder = xml.find(".//body[@name='shoulder']")
    geom = shoulder.find("geom[@mesh='rotation_pitch_so101_v1']")
    local = transform(geom)
    root = transform(shoulder) @ local
    model_point = trimesh.transform_points([center / 1000], root)[0]
    face_vertices, face_triangles = face.tessellate(0.03, 0.05)
    vertices = np.array([v.toTuple() for v in face_vertices])
    target = trimesh.transform_points(vertices / 1000, local)
    mesh = trimesh.load(args.bundle_dir / "meshes/shoulder.obj", force="mesh")
    _, distances, _ = trimesh.proximity.closest_point(mesh, target)
    # Curved hole boundaries differ after tessellation. Check the interior plane
    # anchor and normal independently; report boundary distances without hiding them.
    anchor = trimesh.transform_points([center / 1000], local)
    _, anchor_distance, anchor_triangle = trimesh.proximity.closest_point(mesh, anchor)
    assert anchor_distance[0] < 1e-8
    expected_local_normal = local[:3, :3] @ np.array(face.normalAt().toTuple())
    assert abs(float(mesh.face_normals[anchor_triangle[0]] @ expected_local_normal)) > 1 - 1e-8
    normal = root[:3, :3] @ np.array(face.normalAt().toTuple())
    assert np.allclose(normal, [0, 0, 1], atol=1e-10)
    assert abs(model_point[2] - 0.0724) < 1e-10
    exported_xml = ET.parse(args.bundle_dir / "scene.xml").getroot()
    assert np.allclose(
        transform(exported_xml.find(".//body[@name='shoulder']")), transform(shoulder)
    )
    # Record the reviewed project identity alongside the geometric export checks.
    reviewed_path = ROOT / "examples/assemblies/so101-guided/api-workflow/reviewed-project.json"
    review = json.loads(reviewed_path.read_text())
    followup_path = (
        ROOT
        / "examples/so101/windows/reference-20261024-take3/measurement-followup/measurements.json"
    )
    measurement = json.loads(followup_path.read_text())["measurements"]["base_reference_height"]
    height = measurement["operator_reported_value"] * 25.4
    result = {
        "scope": "Nominal reference-face correspondence and conditional root-height estimate",
        "step_sha256": sha(args.step),
        "model_xml_sha256": sha(reference),
        "reviewed_project_sha256": sha(reviewed_path),
        "reviewed_project_schema": review.get("schema_version"),
        "exported_shoulder_sha256": sha(args.bundle_dir / "meshes/shoulder.obj"),
        "measurement_sha256": sha(followup_path),
        "component": "Rotation_Pitch_SO101 v8",
        "model_link": "shoulder",
        "face_index_zero_based_in_pinned_step_import": index,
        "face_selector": {
            "plane_local_y_mm": 56.4,
            "area_mm2": face.Area(),
            "normal_local": list(face.normalAt().toTuple()),
        },
        "face_center_local_mm": center.tolist(),
        "five_hole_features": holes,
        "part_to_shoulder_transform_m": local.tolist(),
        "part_to_root_at_zero_transform_m": root.tolist(),
        "face_center_relative_to_root_m": model_point.tolist(),
        "face_normal_relative_to_root": normal.tolist(),
        "face_height_above_root_mm": model_point[2] * 1000,
        "max_face_vertex_distance_to_exported_shoulder_mm": float(max(distances) * 1000),
        "p95_face_vertex_distance_to_exported_shoulder_mm": float(
            np.quantile(distances, 0.95) * 1000
        ),
        "interior_face_anchor_distance_to_exported_mesh_mm": float(anchor_distance[0] * 1000),
        "boundary_check_scope": "Sampled analytic face vertices versus tessellated mesh; not an exhaustive surface-distance bound",
        "operator_height_inches": measurement["operator_reported_value"],
        "converted_height_mm": height,
        "conditional_root_height_above_table_mm": height - model_point[2] * 1000,
        "suggested_display_root_height_mm_approx": round(height - model_point[2] * 1000),
        "uncertainty_mm": None,
        "applied_to_accepted_export": False,
        "full_mounting_transform_verified": False,
        "assumptions": [
            "Screenshot matched by component silhouette, planar face and five-hole pattern; no source face ID was supplied.",
            "Level base/table: model root Z is tabletop normal. Shoulder pan rotation preserves this face height.",
            "Reported height transfers to the selected face with no known aid offset; transfer uncertainty is unmeasured.",
            "3.038 mm is arithmetic precision, not measurement precision; report approximately 3 mm.",
            "Single height does not determine XY, yaw, tilt, hardware joint mapping or camera extrinsics.",
            "No rigid-body scale fitting; no model, calibration or accepted 0.15 m test scene changed.",
        ],
    }
    (args.output_dir / "report.json").write_text(json.dumps(result, indent=2) + "\n")
    fig = plt.figure(figsize=(12, 6), layout="constrained")
    ax = fig.add_subplot(121, projection="3d")
    for i, f in enumerate(shape.Faces()):
        v, t = f.tessellate(0.1, 0.1)
        v = trimesh.transform_points(np.array([p.toTuple() for p in v]) / 1000, root) * 1000
        if t:
            ax.add_collection3d(
                Poly3DCollection(
                    v[np.array(t)], facecolors="#00bbee" if i == index else "#b8bec4", linewidth=0
                )
            )
    ax.set(
        xlim=(10, 100),
        ylim=(-45, 45),
        zlim=(0, 105),
        xlabel="Root X (mm)",
        ylabel="Root Y (mm)",
        zlabel="Root Z (mm)",
    )
    ax.set_box_aspect((90, 90, 105))
    ax.view_init(25, 135)
    ax.set_title("Matched shoulder bracket face (cyan)")
    top = fig.add_subplot(122)
    for edge in face.Edges():
        pts = np.array([edge.positionAt(float(t)).toTuple() for t in np.linspace(0, 1, 120)])
        top.plot(pts[:, 0], pts[:, 2], color="#007ca6", linewidth=1)
    top.set_aspect("equal")
    top.set(
        xlabel="Part-local X (mm)",
        ylabel="Part-local Z (mm)",
        title="Selected face boundary: four cutouts + center hole",
    )
    top.grid(alpha=0.2)
    fig.suptitle(
        "Nominal face: 72.4 mm above root | reported height: ~75.4 mm | conditional root: ~3 mm"
    )
    fig.savefig(args.output_dir / "face-match.png", dpi=160)
    plt.close(fig)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
