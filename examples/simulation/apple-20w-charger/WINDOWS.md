# Apple charger — Windows verification

Source: `codex/backend-pipeline` commit `43ad99e`. Tested on Yash's Windows PC, 2026-10-23.
The incoming bundle was extracted to a new ignored output directory. Every extracted archive
payload still matches the original ZIP byte-for-byte (hashes recorded in `windows-inspection.json`).
No scene, mesh, mass, scale, contact parameter or validation threshold was changed.
No reconstruction request, physical robot command or camera change was made.

## Numerical result (separate from viewer evidence)

Python 3.12.10, MuJoCo 3.17.0, trimesh 5.2.0, NumPy 2.5.4.
`windows-validation.json`: original and relocated bundle both pass 30,000 steps / 3 simulated
seconds, timestep 0.0001 s. Contact begins at 0.0639 s; peak transient penetration 0.451507 mm
(limit 1 mm); final bottom error -0.000573621 mm (limit 0.2 mm); four final ground contacts.
Final-window linear/angular speeds pass existing limits; no MuJoCo or Python warnings.
Original loop wall time 0.892 s, original total 2.295 s, relocated total 2.172 s;
overall validation including copying/loading 4.490 s. Timing is host/run-specific.

The expected box is 43 x 27 x 58 mm, assumed mass 59 g; measured compiled/rendered extents
match those inputs. Properties remain **estimated**, friction remains unknown in asset.json,
and `synthetic=false` is preserved. This is a real reconstruction with unverified physical inputs.
Headless `viewer_inspected=false` is intentional: manual observations are separate evidence.

## Native viewer observations

- Appearance: rounded rectangular charger-like body and protruding pin-like geometry render in
  uniform blue. Materials/textures are omitted. Seams and blocky/irregular fine features are visible;
  source photos are unavailable in the repo, so photo/shape accuracy was not established.
- Orientation: body tall direction is world Z; pin protrusions run horizontally along Y in the
  side profile. Asset orientation remains identity after settling. Raw input axes were preserved;
  no glTF Y-up to MuJoCo Z-up conversion was applied by preparation. This is a consistent displayed
  pose, but the intended resting/up axis and axis-to-dimension mapping remain unconfirmed.
- Specific concern: the estimated 58 mm Z extent was described as including a pin allowance, while
  protrusions appear along Y. Do not treat these assigned dimensions as a verified physical fit.
  The existing notes also document 34.9% spread in nonuniform scale factors; proportions are distorted.
- Collision inspected separately from the same side camera: one solid orange box, half extents
  21.5 x 13.5 x 29 mm, covers body, protrusions and empty space. It has no pin separation, gap,
  recess or insertion contact geometry. The visual mesh is excluded from collisions.
- No visible falling-through or instability in these upright box-proxy viewer runs. Native windows
  completed/closed cleanly with zero warning counters. This says nothing about physical pin contacts.

Evidence: `windows-evidence/charger-appearance-close.png`, `charger-side-profile.png`,
`charger-orientation-axes.png` (X red / Y green / Z blue), `charger-collision-side.png`.
Separate telemetry: `windows-viewer-*.json` records camera angles, wall/simulated durations,
timestep and warnings. Close appearance run: 31.489 wall s / 29.843 simulated s.
Collision run: 40.015 wall s / 38.293 simulated s. Both use 0.0001 s steps.

## Short demo

`windows-evidence/charger-drop-demo.gif`: actual MuJoCo offscreen-rendered replay of the unchanged
scene, approximately 4x slow motion, explicitly labelled as box collision and estimated properties.
This is **not native screen recording** and not photo/physics accuracy evidence. Native proof is
provided by the screenshots above. Recorded 31 frames, 0.999 simulated seconds, 4.7 s playback
including initial hold, 2.056 s generation wall time, zero warnings. Exact telemetry is next to GIF.

## Reproduce (PowerShell, repository root)

```powershell
& .\.venv-sim\Scripts\python.exe -m pip install -e ".[dev,simulation]"
$chargerOutput = "outputs/simulation/apple-charger-$(Get-Date -Format yyyyMMdd-HHmmss)"
Expand-Archive -LiteralPath examples/simulation/apple-20w-charger/simulation.zip -DestinationPath $chargerOutput
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.validate "$chargerOutput/scene.xml" --report "$chargerOutput/windows-validation.json"
# Opposite face / appearance, no axes obscuring the mesh
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene "$chargerOutput/scene.xml" --azimuth 90 --elevation -15 --distance 0.18
# Side profile, then collision proxy from the same angle
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene "$chargerOutput/scene.xml" --azimuth 0 --elevation -10 --distance 0.18
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene "$chargerOutput/scene.xml" --collision --azimuth 0 --elevation -10 --distance 0.18
# Optional orientation axes, and separately a labelled rendered GIF
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene "$chargerOutput/scene.xml" --body-axes --azimuth 270 --elevation -20
& .\.venv-sim\Scripts\python.exe tools/simulation/record_demo.py --scene "$chargerOutput/scene.xml" --output "$chargerOutput/charger-demo.gif"
```

Close each native viewer before launching the next. The ZIP and source reconstruction remain
unchanged and are already pushed. New Windows evidence is committed separately; local output paths
are not required on the other computer. Existing synthetic fixtures and camera work remain intact.

## What Johaan's computer needs next

No Windows simulator runtime blocker remains. Before physical/geometry acceptance, have Yash
confirm specimen dimensions, pin allowance/direction, mass and intended resting pose. Srijan should
resolve orientation/dimension-axis mapping **before** scaling, then review the resulting proportions.
Re-export and rerun unchanged validation on the revised asset. If the task needs pin contacts,
coordinate a more detailed collision representation; one box cannot certify those interactions.
Keep current output available as a labelled estimated reconstruction and coarse-collision demo.
