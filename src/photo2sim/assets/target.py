"""Source-bound existing surface islands; inspection never selects or edits originals."""

import hashlib
import json
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

import numpy as np
import trimesh

ALGORITHM = "surface-islands-exact-seams-v1"


def geometry_context(source_hash, island_ids, orientation):
    value = {
        "source": source_hash,
        "algorithm": ALGORITHM,
        "islands": sorted(island_ids),
        "orientation": {k: float(v) if v else 0.0 for k, v in orientation.model_dump().items()},
    }
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def whole_geometry_context(source_hash, orientation):
    value = {
        "source": source_hash,
        "scope": "whole_reconstruction",
        "orientation": {k: float(v) if v else 0.0 for k, v in orientation.model_dump().items()},
    }
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _components(mesh):
    # Weld identical positions for connectivity analysis only, never export geometry.
    _, vertices = np.unique(mesh.vertices, axis=0, return_inverse=True)
    faces = vertices[mesh.faces]
    edges = np.sort(faces[:, [[0, 1], [1, 2], [2, 0]]].reshape(-1, 2), axis=1)
    owners = np.repeat(np.arange(len(faces)), 3)
    order = np.lexsort((edges[:, 1], edges[:, 0]))
    parent = np.arange(len(faces))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a, b in zip(order[:-1], order[1:]):
        if edges[a, 0] != edges[a, 1] and np.array_equal(edges[a], edges[b]):
            x, y = find(owners[a]), find(owners[b])
            if x != y:
                parent[y] = x
    groups = {}
    for i in range(len(faces)):
        groups.setdefault(int(find(i)), []).append(i)
    return list(groups.values())


@dataclass
class TargetGeometry:
    source_mesh_sha256: str
    mesh: trimesh.Trimesh
    islands: list[dict]
    face_sets: dict[str, np.ndarray]

    def inventory(self, *, preview=False):
        result = {
            "source_mesh_sha256": self.source_mesh_sha256,
            "algorithm": ALGORITHM,
            "islands": self.islands,
        }
        if preview:
            result["geometry"] = {}
            for island in self.islands:
                part = self.select([island["id"]])
                result["geometry"][island["id"]] = {
                    "vertices": part.vertices.tolist(),
                    "faces": part.faces.tolist(),
                }
        return result

    def select(self, island_ids):
        if not island_ids or len(set(island_ids)) != len(island_ids):
            raise ValueError("Select at least one island, without duplicates")
        if any(i not in self.face_sets for i in island_ids):
            raise ValueError("Selection is not part of this source inventory")
        faces = np.sort(np.concatenate([self.face_sets[i] for i in island_ids]))
        return self.mesh.submesh([faces], append=True, repair=False)


def inspect_target(path: Path):
    from photo2sim.assets.prepare import _check_geometry

    path = Path(path)
    if path.suffix.lower() not in (".obj", ".glb"):
        raise ValueError("Target review supports OBJ or GLB")
    data = path.read_bytes()
    source_hash = hashlib.sha256(data).hexdigest()
    # The bytes used for parsing are exactly those hashed, including during races.
    try:
        scene = trimesh.load(
            BytesIO(data), file_type=path.suffix[1:].lower(), force="scene", process=False
        )
    except Exception:
        raise ValueError("Could not parse the saved source geometry") from None
    parts = [p for p in scene.dump() if isinstance(p, trimesh.Trimesh) and len(p.faces)]
    if not parts:
        raise ValueError("Source has no triangle geometry")
    mesh = parts[0].copy() if len(parts) == 1 else trimesh.util.concatenate(parts)
    # Validate a copy so inventory face indices retain the loader's source order.
    _check_geometry(mesh.copy(), path)
    islands, face_sets, offset = [], {}, 0
    for node, part in enumerate(parts):
        for local_faces in _components(part):
            local_faces = np.asarray(local_faces, dtype=np.int64)
            indices = np.unique(part.faces[local_faces])
            bounds = np.array(
                [part.vertices[indices].min(axis=0), part.vertices[indices].max(axis=0)]
            )
            key = hashlib.sha256(
                (source_hash + ALGORITHM + str(node)).encode() + local_faces.astype("<i8").tobytes()
            ).hexdigest()
            islands.append(
                {
                    "id": key,
                    "label": f"Surface {len(islands) + 1}",
                    "node_index": node,
                    "face_count": len(local_faces),
                    "vertex_count": len(indices),
                    "bounds_input_units": bounds.tolist(),
                }
            )
            face_sets[key] = local_faces + offset
        offset += len(part.faces)
    return TargetGeometry(source_hash, mesh, islands, face_sets)


def selected_geometry(path, review):
    target = inspect_target(path)
    if target.source_mesh_sha256 != review.source_mesh_sha256 or review.algorithm != ALGORITHM:
        raise ValueError("Source geometry changed; review the target again")
    if (
        geometry_context(target.source_mesh_sha256, review.island_ids, review.orientation)
        != review.geometry_context_sha256
    ):
        raise ValueError("Geometry review context is invalid")
    return target.select(review.island_ids)
