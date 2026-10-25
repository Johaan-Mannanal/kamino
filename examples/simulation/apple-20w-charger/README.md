# Real charger: integrated simulation example

**Geometry review: correction required.** The source reconstruction included the iPad/case under the charger, and the pin direction does not match the estimated dimension-axis assignment. Keep this bundle as a pipeline/physics smoke test; it is not an accepted faithful charger asset. See the [correction handoff](../../../docs/handoffs/charger-geometry-correction.md). The original ZIP and reports remain unchanged.

This bundle was built from the [real Meshy charger reconstruction](../../reconstruction/apple-20w-charger/README.md), using the user's requested **estimated** properties: full extents 43 × 27 × 58 mm including pins and mass 59 g. It is not a synthetic cube or a measured digital twin. No new reconstruction request was made for this integration run.

- `simulation.zip`: portable bundle, with `scene.xml` at the archive root, geometry-only OBJ, `asset.json`, numerical assumptions and actual validation report.
- `asset.json`: provenance and preparation notes, also included in the ZIP.
- `validation-report.json`: actual Mac headless results, also included in the ZIP.

Both original and relocated scenes passed 30,000 steps / 3 simulated seconds at a 0.0001 s timestep. Maximum transient penetration was 0.4515 mm, below the existing 1 mm threshold. Finite state, ground contact, resting height, settling and warning checks passed. Environment: Python 3.13.7, MuJoCo 3.3.7 (Intel Mac wheel), NumPy 2.5.4, trimesh 5.2.0. Windows MuJoCo 3.17 revalidation and native viewer inspection remain pending.

## Reproduce on Windows

From a clean team checkout after merging `origin/codex/backend-pipeline` into your feature branch:

```powershell
& .\.venv-sim\Scripts\python.exe -m pip install -e ".[dev,simulation]"
$chargerOutput = "outputs/simulation/apple-charger-$(Get-Date -Format yyyyMMdd-HHmmss)"
Expand-Archive -Path examples/simulation/apple-20w-charger/simulation.zip -DestinationPath $chargerOutput
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.validate "$chargerOutput/scene.xml" --report "$chargerOutput/windows-validation.json"
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene "$chargerOutput/scene.xml"
```

Inspect the actual shape, axes and separate collision proxy; record your real versions, report and viewer evidence. This example passing basic physics does not establish correct orientation, accurate mass/friction, pin contact geometry, manipulation success or policy-training suitability.

## Limitations

Input axes were preserved rather than inferred or rotated. Independent scaling forced the requested dimensions and produced a documented 34.9% spread in scale factors; model proportions need visual review. The entire object, including pins and empty space between them, uses one bounding box collision. Inertia assumes a uniformly filled cuboid. Unknown friction stays null in the asset record; the simulator uses separately documented defaults. Textures/materials are omitted in the simulation copy; source reconstruction is preserved. No viewer inspection is claimed by the headless report.
