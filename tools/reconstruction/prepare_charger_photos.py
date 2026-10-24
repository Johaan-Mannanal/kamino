"""Reproduce reviewed charger cutouts from exact source photos, without AI editing."""

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import numpy as np
from PIL import Image, ImageDraw, ImageOps


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--spec", type=Path, default=Path(__file__).with_name("charger_new_photo_masks.json")
    )
    args = parser.parse_args()
    spec = json.loads(args.spec.read_text())
    args.output.mkdir(parents=True, exist_ok=False)
    for folder in ("native", "upload-1024"):
        (args.output / folder).mkdir()
    preview = Image.new("RGB", (1600, 850), "#e5e5e5")
    report = {"method": spec["method"], "meshy_requests": 0, "views": []}
    for index, entry in enumerate(spec["selected_views"]):
        source = args.source / entry["source_file"]
        if digest(source) != entry["source_sha256"]:
            raise ValueError(f"Source hash mismatch: {source.name}")
        with Image.open(source) as original:
            crop = ImageOps.exif_transpose(original).convert("RGB").crop(entry["crop_box"])
        mask = Image.new("L", crop.size, 0)
        draw = ImageDraw.Draw(mask)
        draw.polygon([tuple(p) for p in entry["outline"]], fill=255)
        for ellipse in entry["background_hole_ellipses"]:
            draw.ellipse(ellipse, fill=0)
        bounds = mask.getbbox()
        assert bounds and bounds[0] > 0 and bounds[1] > 0
        assert bounds[2] < crop.width and bounds[3] < crop.height
        rgba = crop.copy()
        rgba.putalpha(mask)
        white = Image.new("RGB", crop.size, "white")
        white.paste(crop, mask=mask)
        prefix = args.output / "native" / f"view-{entry['id']}"
        crop.save(prefix.with_suffix(".source-crop.png"))
        mask.save(prefix.with_suffix(".mask.png"))
        rgba.save(prefix.with_suffix(".rgba.png"))
        white.save(prefix.with_suffix(".white.png"))
        with Image.open(prefix.with_suffix(".rgba.png")) as saved:
            opaque = np.array(saved)[:, :, 3] == 255
            assert np.array_equal(np.array(saved)[:, :, :3][opaque], np.array(crop)[opaque])
        # Native copies retain pixels; only the explicitly named upload copies resample.
        subject = white.crop(bounds)
        edge = max(subject.size)
        side = round(edge * 1.2)
        canvas = Image.new("RGB", (side, side), "white")
        canvas.paste(subject, ((side - subject.width) // 2, (side - subject.height) // 2))
        canvas.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        upload = args.output / "upload-1024" / f"view-{entry['id']}.jpg"
        canvas.save(upload, quality=95, subsampling=0)
        assert digest(source) == entry["source_sha256"]
        for row, display in enumerate((crop, canvas)):
            thumb = ImageOps.contain(display, (380, 370))
            preview.paste(thumb, (index * 400 + (400 - thumb.width) // 2, 35 + row * 410))
        ImageDraw.Draw(preview).text((index * 400 + 15, 10), f"View {entry['id']}", fill="black")
        report["views"].append(
            {
                **entry,
                "retained_rgb_verified": True,
                "upload_bytes": upload.stat().st_size,
                "upload_sha256": digest(upload),
                "mask_pixels": int(opaque.sum()),
            }
        )
    preview.save(args.output / "before-after.jpg", quality=92)
    (args.output / "manifest.json").write_text(json.dumps(report, indent=2) + "\n")
    (args.output / "README.txt").write_text(
        "Upload the four JPEGs in upload-1024 together. Native cutouts and masks preserve "
        "decoded source pixels; upload JPEGs are padded, resampled and compressed.\n"
        "Manual masks are approximate, not measured silhouettes. View 07 overlaps both pins; "
        "view 03 disambiguates them. View 08 has a soft rear outline.\n"
        "No physical dimensions are established by these photos. No reconstruction run "
        "or mesh-quality improvement is claimed.\n"
    )
    archive = args.output / "charger-reconstruction-inputs.zip"
    with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
        for item in sorted((args.output / "upload-1024").glob("*.jpg")):
            bundle.write(item, f"upload-1024/{item.name}")
        for name in ("manifest.json", "README.txt"):
            bundle.write(args.output / name, name)
    with ZipFile(archive) as bundle:
        assert bundle.testzip() is None
    print(
        json.dumps(
            {
                "output": str(args.output),
                "views": len(report["views"]),
                "zip_bytes": archive.stat().st_size,
                "retained_rgb_verified": True,
            }
        )
    )


if __name__ == "__main__":
    main()
