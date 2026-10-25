# Charger photo preparation

The new nine-photo capture adds side views and the USB-C face missing from the
initial capture. The reviewed selection is views 03, 06, 07 and 08. Original
photos live locally in `data/captures/object-01-new`; they are ignored by Git.

Run from the repository root with the project's simulation dependencies installed:

```sh
python tools/reconstruction/prepare_charger_photos.py \
  --source data/captures/object-01-new \
  --output outputs/geometry-review/new-photo-cleanup/new-run
```

The output directory must be new. The script verifies source hashes against
`charger_new_photo_masks.json`, applies manually traced binary masks, and saves
lossless source crops, masks, RGBA cutouts and white-background composites.
Retained RGB values are checked against the decoded original. Upload JPEGs are
separate padded, proportionally resized and compressed derivatives. There is no
generative editing, sharpening, perspective correction or stretching.

The reviewed local result is `outputs/geometry-review/new-photo-cleanup/prepared-v2`.
Its ZIP contains four upload JPEGs, a provenance manifest and usage notes. The
before/after sheet has original crops above and upload derivatives below.
All nine source files remain unchanged. The unused tracing draft for the old capture is archived locally under
`outputs/geometry-review/photo-cleanup/old-mask-draft.json`.

These are approximate manual cutouts. The rear silhouette of view 08 is soft;
view 07 overlaps both pins in projection. View 03 shows the two pins separately.
The masks do not establish dimensions, physical properties or reconstruction
accuracy. No Meshy job has been submitted with this set. Next, reconstruct and
inspect the unscaled mesh for body proportions, two pins, USB-C face and absence
of supporting background geometry before choosing axes and scaling.
