"""Reproduce the charger axis/proportion audit without changing either input bundle.

Run from the repository root with .venv-sim Python. This is geometry inspection,
not source-photo comparison, segmentation, axis correction, or viewer evidence.
"""

import argparse
import hashlib
import itertools
import json
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import numpy as np
import trimesh
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "examples/reconstruction/apple-20w-charger/mesh.glb"
BUNDLE = Path(__file__).resolve().parent / "simulation.zip"


def projections(raw, prepared, destination):
    canvas = Image.new("RGB", (1500, 1100), "white")
    draw = ImageDraw.Draw(canvas)
    rows = [("Raw reconstruction (provider units)", raw), ("Prepared bundle (metres)", prepared)]
    for row, (name, mesh) in enumerate(rows):
        vertices = mesh.vertices - mesh.bounds.mean(axis=0)
        for col, (a, b) in enumerate([(0, 1), (0, 2), (2, 1)]):
            coords = vertices[:, [a, b]]
            span = np.ptp(coords, axis=0)
            xy = np.round(coords * (420 / span.max())).astype(int)
            mask = np.full((460, 460, 3), 255, dtype=np.uint8)
            mask[230 - xy[:, 1], 230 + xy[:, 0]] = [30, 60, 85]
            canvas.paste(Image.fromarray(mask), (col * 500 + 20, row * 550 + 60))
            draw.text((col * 500 + 20, row * 550 + 15), name, fill="black")
            label = (
                f"{'XYZ'[a]} horizontal / {'XYZ'[b]} vertical; extents {span[0]:.6g}, {span[1]:.6g}"
            )
            draw.text((col * 500 + 20, row * 550 + 35), label, fill="black")
    canvas.save(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "outputs/charger-review")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    raw_bytes = RAW.read_bytes()
    raw = trimesh.load(RAW, force="scene", process=False).to_mesh()
    # Read only the named OBJ member; no archive extraction or material resolution.
    with ZipFile(BUNDLE) as archive:
        asset = json.loads(archive.read("asset.json"))
        prepared = trimesh.load(
            BytesIO(archive.read(asset["visual_mesh"])), file_type="obj", process=False
        )
    target = np.array([asset["properties"]["dimensions_m"][axis] for axis in "xyz"])
    scales = target / raw.extents
    normalized = (raw.vertices - raw.bounds.mean(axis=0)) * scales
    correspondence = raw.vertices.shape == prepared.vertices.shape
    maximum_error = float(np.abs(prepared.vertices - normalized).max()) if correspondence else None
    permutations = []
    for order in itertools.permutations(range(3)):
        factors = target / raw.extents[list(order)]
        permutations.append(
            {
                "source_axes_for_output_xyz": "".join("XYZ"[i] for i in order),
                "scale_factors": factors.tolist(),
                "scale_spread_percent": float((factors.max() / factors.min() - 1) * 100),
            }
        )
    # Equal-width raw-Y slabs expose the broad backing slab and pin-bearing rise.
    # These are descriptive samples, not semantic segmentation or measured dimensions.
    slices = []
    levels = np.linspace(*raw.bounds[:, 1], 11)
    for low, high in zip(levels[:-1], levels[1:]):
        vertices = raw.vertices[(raw.vertices[:, 1] >= low) & (raw.vertices[:, 1] <= high)]
        slices.append(
            {
                "raw_y_interval": [float(low), float(high)],
                "vertex_count": len(vertices),
                "raw_xyz_extents": np.ptp(vertices, axis=0).tolist(),
            }
        )
    report = {
        "scope": "Static geometry audit; source photographs unavailable in this checkout",
        "production_behavior_changed": False,
        "raw_sha256": hashlib.sha256(raw_bytes).hexdigest(),
        "simulation_zip_sha256": hashlib.sha256(BUNDLE.read_bytes()).hexdigest(),
        "raw_extents_provider_units": raw.extents.tolist(),
        "prepared_extents_m": prepared.extents.tolist(),
        "prepared_bbox_centre_m": prepared.bounds.mean(axis=0).tolist(),
        "raw_vertex_count": len(raw.vertices),
        "prepared_vertex_count": len(prepared.vertices),
        "face_indices_equal": bool(np.array_equal(raw.faces, prepared.faces)),
        "maximum_vertex_error_from_documented_preparation_m": maximum_error,
        "current_scale_factors": scales.tolist(),
        "current_scale_spread_percent": float((scales.max() / scales.min() - 1) * 100),
        "axis_permutations": permutations,
        "raw_y_slices": slices,
        "interpretation": [
            "Static projections show pins extending along raw +Y, preserved as prepared +Y.",
            "The 58 mm dimension documented as including pins was applied along Z, not Y.",
            "The raw mesh contains a broad square slab behind a smaller pin-bearing rise.",
            "Slab identity cannot be confirmed without source photos; do not auto-segment it.",
            "No pure axis permutation makes these estimated dimensions uniformly fit this mesh.",
            "Scale-spread minimization alone would choose the semantically wrong pin direction.",
        ],
        "source_photos_reviewed": False,
        "native_viewer_inspected": False,
    }
    (args.output / "geometry-review.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    projections(raw, prepared, args.output / "orthographic-review.png")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
