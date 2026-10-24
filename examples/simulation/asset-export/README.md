# Shared AssetRecord → MuJoCo export examples

All three inputs under `prepared/` are deliberately synthetic, centred, oriented meshes **already
in metres**, with estimated/assumed properties and `synthetic=true`. No photos, Meshy jobs or
real-world measurements were involved. These fixtures do not use the older mm-based example format.

| Case | Full dimensions (m) | Assumed mass (kg) | Simulated duration | Timestep | Loop wall time | Total validation wall time, including relocation |
| --- | --- | --- | --- | --- | --- | --- |
| small-cube | 0.04 × 0.04 × 0.04 | 0.05 | 3 s | 0.0001 s | 0.885 s | 1.979 s |
| flat-cuboid | 0.12 × 0.08 × 0.025 | 0.35 | 3 s | 0.0001 s | 0.987 s | 2.031 s |
| tall-cuboid | 0.035 × 0.045 × 0.10 | 0.12 | 3 s | 0.0001 s | 0.944 s | 2.016 s |

These are measured Windows runtimes, not performance guarantees. Each original and copied scene
passed finite-state, rendered scale, mass/inertia, actual ground contact, penetration and settling
checks. All cases had first contact at 0.0639 s, peak penetration approximately 0.452 mm, no Python
or MuJoCo warnings, and a final bottom-height error of about 0.000574 mm. Exact results/thresholds
are in `bundles/report.json` and each `validation-report.json`.

Each portable output contains `scene.xml`, a copied metre-scale visual mesh, unchanged shared
`asset.json`, and separate `simulation.json` assumptions. `scale="1 1 1"`; full dimensions become
box half extents only for collision. Explicit inertia uses a labelled uniform-cuboid approximation.
Unknown sliding friction remains null in the asset; simulation uses a documented 0.8 default,
with assumed torsional/rolling terms 0.005/0.0001. Supplied sliding friction, including zero,
is preserved and used. No original source file is edited.

## Run (PowerShell, repository root)

```powershell
& .\.venv-sim\Scripts\python.exe -m pip install -e ".[dev,simulation]"
# Choose a NEW output directory for each export; existing outputs are never overwritten.
& .\.venv-sim\Scripts\python.exe tools/simulation/export_examples.py --output-dir outputs/simulation/asset-export-run
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.validate examples/simulation/asset-export/bundles/flat-cuboid/scene.xml --report outputs/simulation/flat-validation.json
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene examples/simulation/asset-export/bundles/flat-cuboid/scene.xml
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene examples/simulation/asset-export/bundles/flat-cuboid/scene.xml --collision
```

The validator checks the original bundle and a temporary copied folder, reporting simulated
duration, timestep, loop wall time, total wall time and thresholds separately. It returns a dict
and its CLI exits nonzero on failure. The headless report's `viewer_inspected=false` is intentional:
visual inspection is separate evidence, not inferred from numeric results.

The flat cuboid's **native visual-mesh viewer was inspected**: blue mesh rests on the ground with
no visible instability. `evidence/native-export-viewer.png` and `viewer-report.json` preserve
that observation/telemetry separately: 30.309 wall seconds, 28.490 simulated seconds, 0.0001 s
step, zero warning counters, clean close. The viewer helper now frames the model's own statistic
centre/extent rather than hard-coding the older table fixture camera.

## Integration example

```python
from pathlib import Path
from photo2sim.contracts import AssetRecord
from photo2sim.simulation.export import export_asset
from photo2sim.simulation.validate import validate_export

prepared_dir = Path("examples/simulation/asset-export/prepared/flat-cuboid")
asset = AssetRecord.model_validate_json((prepared_dir / "asset.json").read_text())
scene = export_asset(asset, prepared_dir, Path("outputs/my-new-export"))
report = validate_export(scene)
# Caller persists the report and decides job status; export alone only checks model loading.
assert report["passed"], report
```

The existing `AssetRecord` is authoritative. Backend orchestration remains Johaan's module;
preparation/scaling/centring remain Srijan's. Prepared inputs must be self-contained geometry-only
OBJ or STL. GLB/material/texture conversion is not done here. Unsupported collision kinds fail
clearly. Missing, escaping, wrongly scaled or off-centre meshes fail before publication. A sibling
staging directory protects existing outputs; model loading must succeed before scene.xml appears
in the requested new output directory.

## Scope and numerical assumptions

Same settings/thresholds for all three objects: 20 mm upright drop, gravity -9.81 m/s²,
0.1 ms timestep, 2 ms contact time constant and damping ratio 1. The time constant has 20
substeps. This is a small box-proxy smoke test, not copied old fixture tuning or calibrated material
behaviour. Limits: 1 mm penetration, 0.2 mm final bottom-height error, 1 mm/s linear and
0.01 rad/s angular speed over the final 0.5 s. Other orientations, large drops, complex collisions,
textures, arbitrary materials and physical fidelity are not certified. Box inertia/contact remain
explicit approximations even when dimensions and mass have measured provenance.
