# Shared AssetRecord simulation export — Yash

Branch: `codex/windows-simulation-setup`. Backend branch merged at
`17d51fc763ea6d1bdb54da35085842798dcfb994`; main was not modified.
The final chat handoff gives the full pushed implementation SHA.
Original mm fixtures, camera work and LeRobot remain intact.

## Delivered boundary

```python
from pathlib import Path
from photo2sim.contracts import AssetRecord
from photo2sim.simulation.export import export_asset
from photo2sim.simulation.validate import validate_export

prepared = Path("examples/simulation/asset-export/prepared/flat-cuboid")
asset = AssetRecord.model_validate_json((prepared / "asset.json").read_text())
scene = export_asset(asset, prepared, Path("outputs/new-asset-bundle"))
report = validate_export(scene)
assert report["passed"], report
```

Callable: `export_asset(asset: AssetRecord, asset_dir: Path, output_dir: Path) -> Path`.
Returns the new bundle's scene.xml. Input mesh is already centred/oriented/in metres;
no old mm scale or mesh preparation is applied. `asset.json` preserves the complete shared
record, property provenance, notes and synthetic flag. `simulation.json` records separate
assumptions: uniform-cuboid inertia approximation, box proxy, initial clearance/contact,
friction defaults, gravity and timestep. Unknown friction is not written back as a measurement.
Unsupported collision kinds, non-OBJ/STL formats, external materials, bad paths, wrong scale,
off-centre or invalid mesh fail before publication. Existing output directories are rejected.
Model loading must succeed in staging before the new bundle is published; sources are unchanged.

Reusable validator: `validate_export(scene, *, duration_s=3.0, check_portability=True) -> dict`.
Checks loaded/rendered scale, mass, inertia, finite state, actual ground contact, penetration,
resting height, linear/angular settling, warnings, and a copied bundle. It reports timestep,
simulated duration, simulation-loop wall time and total wall time including relocation.
Headless numeric results explicitly do not claim viewer inspection or real-world fidelity.

## Exact commands (PowerShell, isolated simulation worktree root)

```powershell
& .\.venv-sim\Scripts\python.exe -m pip install -e ".[dev,simulation]"
& .\.venv-sim\Scripts\python.exe -m pip check
& .\.venv-sim\Scripts\python.exe -m ruff check .
& .\.venv-sim\Scripts\python.exe -m ruff format --check .
& .\.venv-sim\Scripts\python.exe -m pytest -q
# New output directory required; never overwrites prior exports.
& .\.venv-sim\Scripts\python.exe tools/simulation/export_examples.py --output-dir outputs/simulation/asset-export-new-run
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.validate examples/simulation/asset-export/bundles/flat-cuboid/scene.xml --report outputs/simulation/export-validation.json
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene examples/simulation/asset-export/bundles/flat-cuboid/scene.xml
```

## Actual evidence

Prepared records and complete portable outputs for three synthetic cases are pushed under
`examples/simulation/asset-export/`. All property values are estimated/assumed, not measured.
Dimensions/masses: 0.04×0.04×0.04 m / 0.05 kg; 0.12×0.08×0.025 m / 0.35 kg;
0.035×0.045×0.10 m / 0.12 kg. Same numerical settings and acceptance thresholds for all cases.
Each passes 30,000 steps / 3 simulated seconds at timestep 0.0001 s, original and relocated.
First contact 0.0639 s; peak penetration approximately 0.452 mm; settles without simulation warnings.
Measured loop wall times 0.885–0.987 s; total validation with relocation 1.979–2.031 s.
Exact per-run numbers and thresholds are in the pushed reports; runtimes vary by host.

Native flat-cuboid visual mesh inspected: correct blue cuboid resting on the ground, no visible
instability, clean close. Separate viewer run: 30.309 wall seconds / 28.490 simulated seconds,
timestep 0.0001 s, zero warning counters. Screenshot and viewer report are pushed separately.
The viewer helper now frames the scene's model centre/extent rather than the old table fixture.

Final suite: **62 passed, 2 skipped** in 8.42 s. Both skips require unavailable Windows symlink
privileges (existing API and new exporter tests). One upstream Starlette/httpx deprecation warning.
Ruff lint/format, package imports, reusable validator CLI and pip check pass.
Python 3.12.10; MuJoCo 3.17.0; trimesh 5.2.0; NumPy 2.5.4. Updated complete version snapshot:
`tools/simulation/environment-windows.json`. No shared contracts, preparation or API worker code changed.

## Limitations / next integration

Only centred box proxies and geometry-only OBJ/STL inputs. Srijan should emit these prepared formats;
GLB/material conversion is not implemented here. Fixed uniform-cuboid inertia, default contact/friction,
a modest 20 mm upright drop, and one free body are smoke-test assumptions, not general physical
certification. Same limits across all objects: 1 mm peak penetration, 0.2 mm final bottom error,
1 mm/s linear and 0.01 rad/s angular speed over the final 0.5 s. No threshold tuning per fixture.
No Meshy call, training or physical deployment was performed. The backend still owns orchestration.

Next: Johaan calls Srijan's prepare_asset, propagates the job synthetic flag, calls export_asset,
persists validate_export results, and promotes only passing results to completed/export_path.
If validation fails, retain the prepared/exported outputs and report an actionable failure.
Agree on any broader collision or material support before changing the shared contract.
