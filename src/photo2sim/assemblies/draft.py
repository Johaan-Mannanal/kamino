"""Create an unreviewed assembly from common-frame meshes with explicit units."""

import hashlib
import tempfile
from pathlib import Path

from photo2sim.assemblies.export import local_mesh
from photo2sim.assemblies.review import ReviewProject


def draft_from_meshes(name: str, uploads: dict[str, bytes], units: str, synthetic: bool):
    if units not in {"m", "mm"}:
        raise ValueError("Choose metres (m) or millimetres (mm)")
    if not 1 <= len(uploads) <= 128:
        raise ValueError("Select between 1 and 128 component meshes")
    parts, normalized = [], {}
    triangles = 0
    with tempfile.TemporaryDirectory(prefix="photo2sim-mesh-entry-") as temporary:
        root = Path(temporary)
        for index, (filename, data) in enumerate(uploads.items(), 1):
            if (
                not filename
                or filename in {".", ".."}
                or any(c in filename for c in "/\\:\x00")
                or Path(filename).suffix.lower() not in {".obj", ".stl"}
            ):
                raise ValueError("Use distinct flat OBJ/STL filenames; archives are unsupported")
            (root / filename).write_bytes(data)
            try:
                _, mesh = local_mesh(root, filename)
            except (ValueError, OSError, NotImplementedError, IndexError) as exc:
                raise ValueError(f"Invalid geometry-only mesh: {filename}") from exc
            triangles += len(mesh.faces)
            if triangles > 2_000_000:
                raise ValueError("Preview exceeds two million triangles")
            mesh.apply_scale(0.001 if units == "mm" else 1.0)
            part_id = f"part_{index:03d}"
            path = f"meshes/{part_id}.obj"
            output = mesh.export(file_type="obj").encode("utf-8")
            normalized[path] = output
            parts.append(
                {
                    "id": part_id,
                    "mesh": path,
                    "sha256": hashlib.sha256(output).hexdigest(),
                    "source": "user_supplied",
                    "group": "base",
                    "note": f"Input {filename}; original SHA256 {hashlib.sha256(data).hexdigest()}; declared {units}, converted to metres without centering or rotation",
                }
            )
    project = ReviewProject.model_validate(
        {
            "name": name,
            "synthetic": synthetic,
            "root_link": "base",
            "parts": parts,
            "groups": [
                {
                    "name": "base",
                    "mass_kg": {
                        "value": 0.1,
                        "source": "estimated",
                        "note": "Starting assumption; review or replace before export",
                    },
                }
            ],
            "joints": [],
            "notes": [
                f"Mesh-only import: declared source units {units}. All parts must share a common reference frame. Original files retained under originals/.",
                "All parts initially belong to base. Define rigid links and joints; no articulation or physical properties were inferred.",
                "Starting link masses are estimates. Unknown friction remains null; simulator defaults are documented separately.",
            ],
        }
    )
    return project, normalized
