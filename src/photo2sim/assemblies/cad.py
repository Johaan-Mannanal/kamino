"""Optional STEP leaf inventory. Run in an isolated CadQuery/OCP environment.

python -m photo2sim.assemblies.cad source.step --output-dir parts [--names names.json]
No joint inference: component placements are the saved CAD assembly pose.
"""

import argparse
import hashlib
import json
import tempfile
from pathlib import Path


def import_step(source: Path, output: Path, names: list[str] | None = None) -> dict:
    import cadquery as cq
    import numpy as np
    import trimesh
    from cadquery.occ_impl.importers.assembly import _get_name
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.STEPCAFControl import STEPCAFControl_Reader
    from OCP.TCollection import TCollection_ExtendedString
    from OCP.TDF import TDF_Label, TDF_LabelSequence
    from OCP.TDocStd import TDocStd_Document
    from OCP.XCAFDoc import XCAFDoc_DocumentTool

    source, output = Path(source).resolve(strict=True), Path(output).absolute()
    if output.exists() or output.is_symlink():
        raise FileExistsError("Choose a new CAD inventory directory")
    reader = STEPCAFControl_Reader()
    reader.SetNameMode(True)
    if reader.ReadFile(str(source)) != IFSelect_RetDone:
        raise ValueError("STEP reader failed")
    # OpenCASCADE target units: one millimetre. File units are converted on transfer.
    reader.Reader().SetSystemLengthUnit(1.0)
    document = TDocStd_Document(TCollection_ExtendedString("XmlXCAF"))
    if not reader.Transfer(document):
        raise ValueError("STEP transfer failed")
    shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(document.Main())
    roots = TDF_LabelSequence()
    shape_tool.GetFreeShapes(roots)
    leaves = []

    def walk(label, location, path):
        name = _get_name(label)
        if shape_tool.IsReference_s(label):
            ref = TDF_Label()
            shape_tool.GetReferredShape_s(label, ref)
            walk(ref, location * cq.Location(shape_tool.GetLocation_s(label)), path + "/" + name)
        elif shape_tool.IsAssembly_s(label):
            children = TDF_LabelSequence()
            shape_tool.GetComponents_s(label, children)
            for i in range(1, children.Length() + 1):
                walk(children.Value(i), location, path + "/" + name + f"[{i}]")
        else:
            shape = cq.Shape.cast(shape_tool.GetShape_s(label))
            leaves.append((name, path + "/" + name, shape, location))

    for i in range(1, roots.Length() + 1):
        walk(roots.Value(i), cq.Location(), "")
    if names is not None:
        if len(set(names)) != len(names):
            raise ValueError("Duplicate requested names")
        for name in names:
            if (
                sum(
                    (row[0] == name or row[1] == name) and bool(row[2].Vertices()) for row in leaves
                )
                != 1
            ):
                raise ValueError(f"Selection must match exactly one nonempty component: {name}")
    result = {
        "schema_version": "cad-inventory-1.0",
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "units": "metres; STEP transferred in mm then scaled 0.001",
        "tessellation": {"linear_mm": 0.08, "angular_rad": 0.1},
        "parts": [],
        "omitted": [],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".photo2sim-cad-", dir=output.parent) as temp:
        stage = Path(temp) / "parts"
        (stage / "meshes").mkdir(parents=True)
        for i, (name, path, shape, location) in enumerate(leaves):
            if not shape.Vertices() or (
                names is not None and name not in names and path not in names
            ):
                result["omitted"].append(
                    {
                        "name": name,
                        "path": path,
                        "reason": "empty" if not shape.Vertices() else "not selected",
                    }
                )
                continue
            v, f = shape.tessellate(0.08, 0.1)
            mesh = trimesh.Trimesh(
                vertices=np.array([x.toTuple() for x in v]) * 0.001, faces=f, process=True
            )
            ident = f"part_{i:04d}"
            relative = f"meshes/{ident}.stl"
            mesh.export(stage / relative)
            tr = location.wrapped.Transformation()
            matrix = np.eye(4)
            matrix[:3, :3] = [[tr.Value(r, c) for c in range(1, 4)] for r in range(1, 4)]
            matrix[:3, 3] = [tr.Value(r, 4) * 0.001 for r in range(1, 4)]
            result["parts"].append(
                {
                    "id": ident,
                    "cad_name": name,
                    "cad_path": path,
                    "mesh": relative,
                    "sha256": hashlib.sha256((stage / relative).read_bytes()).hexdigest(),
                    "source": "sourced",
                    "note": f"Nominal STEP component: {name}; source " + result["source_sha256"],
                    "pose": {
                        "position_m": matrix[:3, 3].tolist(),
                        "quaternion_wxyz": trimesh.transformations.quaternion_from_matrix(
                            matrix
                        ).tolist(),
                    },
                    "bounds_m": mesh.bounds.tolist(),
                }
            )
        if not result["parts"]:
            raise ValueError("No nonempty parts selected")
        (stage / "inventory.json").write_text(json.dumps(result, indent=2) + "\n")
        if output.exists() or output.is_symlink():
            raise FileExistsError("CAD inventory output appeared during import")
        stage.rename(output)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--names", type=Path)
    args = parser.parse_args()
    result = import_step(
        args.source, args.output_dir, json.loads(args.names.read_text()) if args.names else None
    )
    print(
        json.dumps(
            {
                "parts": len(result["parts"]),
                "omitted": len(result["omitted"]),
                "output": str(args.output_dir),
            }
        )
    )


if __name__ == "__main__":
    main()
