# Cleaned charger: Windows acceptance candidate

This candidate uses a new photo reconstruction without the old support slab.
Before preparation, an explicit +90-degree rotation about X maps raw +Y pins
to simulation +Z. `orientation.json` records the matrix, source hash and scale
factors. The raw provider GLB remains unchanged in the reconstruction example.

The full extents are fitted to the existing **estimated** 43 × 27 × 58 mm,
with estimated mass 59 g and unknown friction. The relative spread in per-axis
scale factors is 5.427%, calculated as `(maximum - minimum) / maximum`; this statistic is
not a measurement of reconstruction error. Independent scaling still changes
proportions. The USB-C recess remains approximate.

Local validation passed the original and relocated scenes: each ran 30,000
steps / 3 seconds, maximum penetration 0.451507 mm, settled, zero simulation
or Python warnings. Environment: Python 3.13.7, MuJoCo 3.3.7 on Intel Mac,
trimesh 5.2.0, NumPy 2.5.4. See `bundle/validation-report.json`.

The scene still uses one box collision proxy, uniform-box inertia and documented
contact defaults. It does not model contact between individual pins. This is a
drop smoke test, not a real-world accuracy certificate. Native viewer acceptance
and Windows MuJoCo 3.17 verification are pending.

## Yash next

Use this candidate; no further photo cleanup or Meshy submission is needed.
From the updated repository root in PowerShell, use a new extraction directory:

```powershell
Expand-Archive examples/simulation/apple-20w-charger-cleaned/simulation.zip outputs/charger-cleaned-windows
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.validate outputs/charger-cleaned-windows/scene.xml --report outputs/charger-cleaned-windows-validation.json
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene outputs/charger-cleaned-windows/scene.xml
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene outputs/charger-cleaned-windows/scene.xml --collision
```

Inspect body proportions, two pins pointing upward, absence of the old slab,
and the USB-C end. Inspect collision separately. Record actual findings,
versions, a screenshot and a short reset/drop demo. Keep limitations visible;
do not change validation thresholds to obtain a pass. Send Johaan the results.

The initial candidate above was prepared/exported outside the API job flow.
The same persistent job has subsequently completed using the new orientation
endpoint; see `api-acceptance/`. Its API-exported mesh matches this manual
candidate's vertices within 1e-8 m. The original GLB remains unchanged, and
no new provider request was made. The previous charger example is retained.
