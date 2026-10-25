"""Offline nominal CAD comparison; requires a separate CadQuery environment."""

import argparse
import hashlib
import importlib.metadata
import json
import re
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh
from cadquery.occ_impl.importers.assembly import _get_name
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.IFSelect import IFSelect_RetDone
from OCP.Interface import Interface_Static
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDF import TDF_Label, TDF_LabelSequence
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFDoc import XCAFDoc_DocumentTool

parser = argparse.ArgumentParser(
    description="Inspect the pinned user-supplied SO101 CAD; no simulator changes."
)
parser.add_argument("--step", type=Path, required=True)
parser.add_argument("--output-dir", type=Path, required=True)
args = parser.parse_args()
source = args.step.read_bytes()
expected = "f754be35708382b05ce65768ae33c612f91dca11ad19d14807dc637eb944ba3d"
if hashlib.sha256(source).hexdigest() != expected:
    raise ValueError("This comparison is scoped to the supplied SO101 Assembly v4 STEP")
robot_root = Path(__file__).resolve().parents[2] / "third_party/robotstudio_so101"
manifest = json.loads((robot_root / "SOURCE.json").read_text())
assert manifest["commit"] == "f3b6013629c7b94f8ee93fd977b161fa8350f9bc"
for filename, record in manifest["files"].items():
    assert hashlib.sha256((robot_root / filename).read_bytes()).hexdigest() == record["sha256"]
out = args.output_dir
out.mkdir(parents=True, exist_ok=False)

r = STEPCAFControl_Reader()
r.SetNameMode(True)
Interface_Static.SetCVal_s("xstep.cascade.unit", "MM")
assert r.ReadFile(str(args.step)) == IFSelect_RetDone
D = TDocStd_Document(TCollection_ExtendedString("XmlXCAF"))
assert r.Transfer(D)
st = XCAFDoc_DocumentTool.ShapeTool_s(D.Main())
roots = TDF_LabelSequence()
st.GetFreeShapes(roots)
parts = []


def walk(label, loc, path):
    name = _get_name(label)
    if st.IsReference_s(label):
        ref = TDF_Label()
        assert st.GetReferredShape_s(label, ref)
        walk(ref, loc * cq.Location(st.GetLocation_s(label)), path + "/" + name)
    elif st.IsAssembly_s(label):
        children = TDF_LabelSequence()
        st.GetComponents_s(label, children)
        for i in range(1, children.Length() + 1):
            walk(children.Value(i), loc, path + "/" + name + f"[{i}]")
    else:
        sh = cq.Shape.cast(st.GetShape_s(label))
        parts.append({"name": name, "path": path + "/" + name, "shape": sh, "loc": loc})


for i in range(1, roots.Length() + 1):
    walk(roots.Value(i), cq.Location(), "")
print("Imported leaves", len(parts), flush=True)

mapping = {
    "Base_SO101 v12": "base_so101_v2",
    "Rotation_Pitch_SO101 v8": "rotation_pitch_so101_v1",
    "Upper_arm_SO101 v9": "upper_arm_so101_v1",
    "Under_arm_SO101 v12": "under_arm_so101_v1",
    "Base_08p v18": "base_motor_holder_so101_v1",
    "Motor_holder_SO101_Base v6": "motor_holder_so101_base_v1",
    "Motor_holder_SO101_Wrist v8": "motor_holder_so101_wrist_v1",
    "Wrist_Roll_Pitch_SO100 v15": "wrist_roll_pitch_so101_v2",
    "Wrist_Roll_Follower_SO101 v10": "wrist_roll_follower_so101_v1",
    "Moving_Jaw_SO101 v3": "moving_jaw_so101_v1",
    "WaveShare_Mounting_Plate_SO101 v4": "waveshare_mounting_plate_so101_v2",
}
comparisons = []
matched = {}
for label, modelname in mapping.items():
    candidates = [p for p in parts if label in p["path"] and p["shape"].Vertices()]
    assert len(candidates) == 1, (label, len(candidates))
    p = candidates[0]
    s = p["shape"]
    matched[modelname] = p
    faces = []
    for f in s.Faces():
        if f.geomType() == "CYLINDER":
            c = f._geomAdaptor().Cylinder()
            faces.append(
                {
                    "radius_mm": c.Radius(),
                    "origin_mm": list(c.Location().Coord()),
                    "axis": list(c.Axis().Direction().Coord()),
                    "area_mm2": f.Area(),
                }
            )
    (out / (modelname + "-cylinders.json")).write_text(json.dumps(faces, indent=2))
    v, f = s.tessellate(0.03, 0.05)
    cad = trimesh.Trimesh(vertices=[x.toTuple() for x in v], faces=f, process=True)
    cad.export(out / (modelname + "-cad.ply"))
    model = trimesh.load(robot_root / "assets" / (modelname + ".stl"), force="mesh")
    model.apply_scale(1000)
    # Local part frames are retained: no fitted alignment or scale.
    b = Bnd_Box()
    BRepBndLib.AddOptimal_s(s.wrapped, b, False, False)
    bounds = np.array(b.Get()).reshape(2, 3)
    dims = bounds[1] - bounds[0]
    vol = s.Volume()
    points, _ = trimesh.sample.sample_surface(model, 2000, seed=101)
    _, d1, _ = trimesh.proximity.closest_point(cad, points)
    points2, _ = trimesh.sample.sample_surface(cad, 2000, seed=102)
    _, d2, _ = trimesh.proximity.closest_point(model, points2)
    rec = {
        "cad_component": label,
        "cad_path": p["path"],
        "model_mesh": modelname + ".stl",
        "cad_bounds_mm": bounds.tolist(),
        "cad_size_mm": dims.tolist(),
        "model_size_mm": model.extents.tolist(),
        "size_delta_mm": (model.extents - dims).tolist(),
        "cad_volume_mm3": vol,
        "model_volume_mm3": float(model.volume),
        "volume_difference_percent": float(100 * (model.volume - vol) / vol),
        "model_to_cad_surface_distance_mm": {
            "p95": float(np.quantile(d1, 0.95)),
            "max_sampled": float(d1.max()),
        },
        "cad_to_model_surface_distance_mm": {
            "p95": float(np.quantile(d2, 0.95)),
            "max_sampled": float(d2.max()),
        },
    }
    comparisons.append(rec)
    print(
        label,
        "size delta",
        np.round(model.extents - dims, 4),
        "volume %",
        round(rec["volume_difference_percent"], 4),
        "surface p95/max",
        np.round([np.quantile(d1, 0.95), d1.max(), np.quantile(d2, 0.95), d2.max()], 4),
        flush=True,
    )
(out / "comparison.json").write_text(json.dumps(comparisons, indent=2))


horns = []
for p in parts:
    if "驱动" not in p["name"]:
        continue
    cyl = []
    for f in p["shape"].Faces():
        if f.geomType() == "CYLINDER":
            c = f._geomAdaptor().Cylinder()
            cyl.append((c.Radius(), c))
    rad, c = max(cyl, key=lambda x: x[0])
    T = p["loc"].wrapped.Transformation()
    R = np.array([[T.Value(i, j) for j in range(1, 4)] for i in range(1, 4)])
    t = np.array([T.Value(i, 4) for i in range(1, 4)])
    origin = R @ np.array(c.Location().Coord()) + t
    axis = R @ np.array(c.Axis().Direction().Coord())
    row = {
        "name": p["name"],
        "path": p["path"],
        "radius_mm": rad,
        "origin_mm": origin.tolist(),
        "axis": axis.tolist(),
    }
    horns.append(row)
    print("HORN", row, flush=True)
(out / "servo-axes.json").write_text(json.dumps(horns, indent=2, ensure_ascii=False))
assert len(horns) == 6
print("Empty leaves", sum(not p["shape"].Vertices() for p in parts))

# Record representation-context unit assignments separately from density units.
entities = dict(re.findall(r"#(\d+)\s*=\s*(.*?);", source.decode(), re.S))
contexts = []
for key, value in entities.items():
    match = re.search(r"GLOBAL_UNIT_ASSIGNED_CONTEXT\(\((.*?)\)\)", value)
    if match:
        refs = re.findall(r"#(\d+)", match[1])
        contexts.append({"id": key, "unit_ids": refs})
assert len(contexts) == 215
assert all(c["unit_ids"] == ["326182", "326184", "326185"] for c in contexts)
assert "SI_UNIT(.MILLI.,.METRE.)" in entities["326182"]
axes = []
for i in (1, 2):
    a1 = np.array(horns[i]["axis"])
    a2 = np.array(horns[i + 1]["axis"])
    angle = float(np.degrees(np.arccos(np.clip(abs(a1 @ a2), -1, 1))))
    axes.append({"servo_instances": [i + 1, i + 2], "acute_axis_angle_deg": angle})
report = {
    "source_sha256": expected,
    "source_branch_commit": "e6ab5589dc3d6bd8c9b80379abaed0bfc1109a81",
    "model_commit": "f3b6013629c7b94f8ee93fd977b161fa8350f9bc",
    "units": "millimetres; all 215 geometry contexts; metre declaration is used in derived properties",
    "leaf_instances": len(parts),
    "empty_leaf_instances": sum(not p["shape"].Vertices() for p in parts),
    "environment": {
        n: importlib.metadata.version(n)
        for n in ["cadquery", "cadquery-ocp", "numpy", "trimesh", "scipy", "rtree"]
    },
    "method": {
        "bounding_boxes": "OpenCASCADE AddOptimal, triangulation and shape tolerance disabled",
        "surface_comparison": "2000 area-weighted samples per direction, seeds 101/102, nearest triangles",
        "cad_tessellation": {"linear_tolerance_mm": 0.03, "angular_tolerance_rad": 0.05},
        "alignment": "original local part coordinates; no registration, deformation or fitted scaling; STL metres converted to mm",
    },
    "comparisons": comparisons,
    "servo_axis_angles": axes,
    "scope": "nominal CAD geometry only; neither physical measurements nor hardware joint calibration",
    "limitations": [
        "Sample maxima are not exhaustive Hausdorff distances",
        "Servo-axis angles come from the saved CAD assembly placements, not measured hardware",
        "No identifiable camera assembly was matched; compare actual bracket separately",
        "No simulator geometry, joint frames, limits, gains or collision settings changed",
    ],
}
(out / "report.json").write_text(json.dumps(report, indent=2) + "\n")
