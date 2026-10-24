# First real photo reconstruction: Apple USB-C charger

This is an intentional, approximately 4.7 MB geometry example for teammate integration. **Not synthetic:** Meshy generated `mesh.glb` from four user-provided charger photos. Source photos and API credentials are not committed. Physical values remain **reference-based estimates**, not measurements of this specimen.

## Provenance and evidence

- Backend job: `61ab2c04-72b7-492a-b20c-3a93dfcb18d5`.
- Meshy task: `01a16bf0-45a6-765b-aeb2-7dbc822968b8`; model `meshy-6`, untextured GLB, auto-size disabled.
- Inputs: four original photos copied to standard JPEG, EXIF orientation applied, longest side at most 1024 pixels, quality 90. Total input JPEG size: 301,264 bytes. Originals preserved locally.
- Completed through the real persistent backend, downloaded before URL expiry, stopped at `awaiting_properties`. Consumed 20 Meshy credits.
- GLB loaded with trimesh: one geometry, 131,480 vertices, 263,192 faces; finite vertices, watertight, consistent winding. Exact hash/bounds are in `mesh-inspection.json`.
- `geometry-preview.png` is a static triangle-subsampled inspection plot. Rounded body and two pins are visible; it is not evidence of fine geometric accuracy or simulator viewer acceptance.

## Files / next integration

- `mesh.glb`: unchanged provider output in raw provider coordinates, **not verified metres or normalized orientation**.
- `properties.estimated.json`: shared `AssetProperties`, 43 × 27 × 58 mm including pins, 59 g, friction unknown. Exact model/pin allowance are unconfirmed; provenance and reference URL are included.
- `mesh-inspection.json`: actual geometric checks and explicit simulation/viewer limitations.

Srijan: use this GLB and property input to exercise `prepare_asset`; normalize orientation, centre, apply scale, and emit geometry-only OBJ/STL in metres for Yash's current exporter. Do not treat raw GLB bounds as physical measurements or assume their axes match the property axes.

Johaan: propagate `synthetic=False`, connect the prepared AssetRecord to `export_asset` and `validate_export`, and persist actual validation results before promoting the job to `completed`. No simulation run or full pipeline completion is established by this example.
