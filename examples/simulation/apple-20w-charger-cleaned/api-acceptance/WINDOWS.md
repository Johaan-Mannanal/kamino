# API-produced cleaned charger ZIP — Windows verification

Source integration: `2ceb12176287c9ab26cc35d6b548160506937573`, merged into
`codex/windows-simulation-setup` with prior fixtures, camera work and accepted demo preserved.
Tested on Yash's Windows PC, 2026-10-24. This verifies the actual provided API download; it does
not claim a new live browser/API execution on this PC. No new Meshy request was made.

## Result

**Pass for the previously accepted coarse-box demo scope.** The actual API-produced simulation.zip
was extracted into a new ignored directory, validated unchanged, and briefly inspected natively.
- Saved orientation is X=90, Y=0, Z=0 degrees in exported AssetRecord.
- Dimensions remain estimated 43 x 27 x 58 mm, mass estimated 59 g; friction unknown.
- Collision remains **one single bounding box**, not per-pin or USB-C contact geometry.
- Mesh vertices match the accepted manual candidate to maximum absolute difference
  1.01915e-17 m (tolerance 1e-8 m); face indices are identical. Box sizes, mass, inertia,
  friction/contact parameters and timestep match. The changed asset ID is expected metadata.
- ZIP SHA256 matches the backend acceptance receipt, and extracted payload bytes are unchanged.
- No repeat demo was recorded: the existing cleaned-candidate drop/reset demo remains applicable.

## Actual Windows numerical and viewer results

Python 3.12.10; MuJoCo 3.17.0; trimesh 5.2.0; NumPy 2.5.4.
Original and relocated scene pass 30,000 steps / 3 simulated seconds at timestep 0.0001 s.
First contact 0.0639 s; maximum penetration 0.451507 mm; final bottom error -0.000573621 mm;
settled; no MuJoCo or Python warnings. Original physics-loop wall time 0.922 s, original total
1.488 s, relocated total 1.565 s, entire validation with relocation 3.067 s.
No scene/mesh/physics settings or acceptance thresholds were changed.

Native viewer: expected rounded body, two upward pins, no old support slab, stable resting pose.
Inspection is consistent with the accepted candidate. Native loop auto-closed cleanly after
45.013 wall seconds / 43.086 simulated seconds, timestep 0.0001 s, zero warning counters.
`windows-native-viewer.png` and `windows-viewer.json` are separate from numerical evidence;
`viewer_inspected=false` in a headless report intentionally does not infer manual observation.
Fine USB-C detail, measured physical fidelity and individual pin interactions remain unverified.

Focused new saved-orientation tests: **11 passed** in 4.32 s, one upstream Starlette/httpx
deprecation warning. Ruff lint, formatting and pip check pass. Earlier synthetic acceptance and
full demo recording were not repeated. No new Windows runtime/integration blocker found.

## Reproduce (already executed, PowerShell from repository root)

```powershell
Expand-Archive examples/simulation/apple-20w-charger-cleaned/api-acceptance/simulation.zip outputs/charger-cleaned-api-windows
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.validate outputs/charger-cleaned-api-windows/scene.xml --report outputs/charger-cleaned-api-windows-validation.json
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene outputs/charger-cleaned-api-windows/scene.xml --azimuth 45 --elevation -20 --distance 0.18
& .\.venv-sim\Scripts\python.exe -m pytest tests/test_orientation.py -q
```

Use a new extraction directory on a later run. Evidence files: `windows-validation.json`,
`windows-comparison.json`, `windows-viewer.json`, `windows-native-viewer.png`. Preserve input
receipt/job/source reports as historical evidence rather than editing their original flags.
Johaan can close the Windows verification item for the API-generated bundle. Frontend orientation
controls remain separate work; preserve estimates and single-box limitations in the product/demo.
