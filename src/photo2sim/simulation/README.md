# Simulation

`export.py` implements `export_asset(asset: AssetRecord, asset_dir: Path, output_dir: Path) -> Path`
using the authoritative `photo2sim.contracts.AssetRecord`. It copies prepared metre-based OBJ/STL
geometry, preserves properties/provenance and synthetic labels, and writes a portable scene with
separate box collision and explicit approximate uniform-cuboid inertia. It rejects existing output
directories and publishes only after preflight and model loading succeed. No mm scaling or mesh
preparation is performed. `asset.json` retains the shared schema; `simulation.json` records separate
assumptions and defaults. Export success alone is not dynamic validation.

`validate.py` implements `validate_export(scene: Path, *, duration_s=3.0, check_portability=True)`.
It returns actual scale/load/finite/contact/settling measurements, fixed thresholds and warning
counts, with timestep, simulated duration and measured wall-clock times. It repeats after copying
the bundle. Its CLI is `python -m photo2sim.simulation.validate SCENE --report REPORT`.
Viewer evidence and real-world fidelity are separate from this upright box-proxy smoke test.

See `examples/simulation/asset-export/README.md` for prepared records, exported bundles, integration
code, measured results, constraints and PowerShell commands. The earlier fixture-specific helper
under `tools/simulation/validate.py` remains unchanged for its original mm-based fixtures.
