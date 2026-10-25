"""Package audited stationary captures for offline browser mapping review."""

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageOps

from photo2sim.simulation.pose_review import audit_capture


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local_file(root, name):
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError("Evidence path must be a file inside the capture directory")
    return path


def build_capture_pack(directories):
    if not 1 <= len(directories) <= 20:
        raise ValueError("Choose between 1 and 20 captures")
    captures = []
    seen = set()
    for root in map(Path, directories):
        if root.name in seen:
            raise ValueError("Duplicate capture id")
        seen.add(root.name)
        audit = audit_capture(root)
        if audit["samples"] > 20_000:
            raise ValueError("Replay capture exceeds 20000 samples; split the recording")
        rows = [
            json.loads(line)
            for line in (root / "observations.jsonl").read_text().splitlines()
            if line.strip()
        ]
        pairing_path = root / "pairing.json"
        pairing = json.loads(pairing_path.read_text()) if pairing_path.exists() else {}
        manifest = root / "integrity.json"
        integrity = json.loads(manifest.read_text()) if manifest.exists() else {}
        for name, entry in integrity.items():
            path = local_file(root, name)
            if digest(path) != entry["sha256"] or path.stat().st_size != entry["bytes"]:
                raise ValueError(f"Evidence integrity mismatch: {name}")
        images = pairing.get("images", [])
        if not images:
            images = [
                {"path": name, "view": Path(name).stem, "sha256": entry["sha256"]}
                for name, entry in integrity.items()
                if name.startswith("photos/") and name.endswith((".png", ".jpg", ".jpeg"))
            ]
        photos = []
        for item in images[:8]:
            path = local_file(root, item["path"])
            sha = digest(path)
            if sha != item["sha256"]:
                raise ValueError("Photo integrity mismatch")
            with Image.open(path) as original:
                preview = ImageOps.contain(original.convert("RGB"), (960, 720))
            buffer = io.BytesIO()
            preview.save(buffer, format="JPEG", quality=85)
            photos.append(
                {
                    "view": item.get("view", path.stem),
                    "original_sha256": sha,
                    "data_url": "data:image/jpeg;base64,"
                    + base64.b64encode(buffer.getvalue()).decode(),
                    "note": "Resized JPEG preview only; original bytes and orientation preserved at source",
                }
            )
        hashes = dict(audit["source_hashes"])
        if pairing_path.exists():
            hashes["pairing.json"] = digest(pairing_path)
        if manifest.exists():
            hashes["integrity.json"] = digest(manifest)
        captures.append(
            {
                "id": root.name,
                "samples": audit["samples"],
                "observations": [
                    {"time_s": row["elapsed_s"], "values": row["observation"]} for row in rows
                ],
                "elapsed_span_s": audit["elapsed_span_s"],
                "calibration_sha256": hashes["calibration.json"],
                "source_hashes": hashes,
                "pairing": pairing,
                "signals": {
                    name: {
                        "unit": v["declared_unit"],
                        "median": v["median"],
                        "minimum": v["minimum"],
                        "maximum": v["maximum"],
                    }
                    for name, v in audit["signals"].items()
                },
                "photos": photos,
            }
        )
    return {
        "format": "photo2sim-captures-1.0",
        "hardware_mapping_verified": False,
        "note": "Local audit checks saved bytes only; pairing and units remain source declarations.",
        "captures": captures,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    pack = build_capture_pack(args.capture)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(pack, stream, indent=2, allow_nan=False)
        stream.write("\n")
    print(f"Packaged {len(pack['captures'])} captures; hardware mapping remains unverified")


if __name__ == "__main__":
    main()
