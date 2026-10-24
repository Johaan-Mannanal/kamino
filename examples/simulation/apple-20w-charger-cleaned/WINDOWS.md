# Cleaned charger — Windows visual and coarse-physics acceptance

Source integration: `e2e8ce8ba4e99b897817952225555ccde4556658`.
Tested by Yash's Windows agent, 2026-10-23, on `codex/windows-simulation-setup`.
No Meshy request was submitted. ZIP, extracted payload, source mesh, estimated properties,
scene settings and validation thresholds remain unchanged. Integrity is recorded in
`windows-inspection.json`.

## Decision and native observations

**Pass for the requested visual/coarse-box demo smoke checks.** Not a measured digital twin,
connector/insertion test, or proof of real-world mass/material accuracy.

- Body: rounded rectangular charger body with plausible proportions relative to the supplied
  photos; no obvious old surrounding iPad/case slab/base is present.
- Pins: two distinct blade-like pins extend upward along simulation +Z. This fixes the previous
  horizontal-pin presentation. The recorded +90-degree X rotation is consistent with the viewer.
- USB-C end: visible elongated recess/outline on the opposite underside. Fine opening shape,
  depth and connector fit remain approximate/unverified. Ground rendering was hidden only for
  this underside camera; physics contacts remained enabled and the file was not edited.
- Materials: geometry-only uniform blue, not original white-plastic/metal texture fidelity.
- Collision inspected separately: one solid orange 43 x 27 x 58 mm bounding box. It fills the
  empty pin gap and surrounding volume and omits USB-C contact recesses. No individual-pin
  contact or precision manipulation is certified.
- Native appearance, underside and collision runs rendered correctly, closed normally and had
  zero warning counters. Input notes saying Windows inspection was pending are historical;
  these new reports record the later inspection without altering original provenance.

Native screenshots: `windows-evidence/cleaned-charger-appearance.png`,
`cleaned-charger-usbc.png`, `cleaned-charger-collision.png`. Separate telemetry:
`windows-viewer-appearance.json`, `windows-viewer-usbc.json`, `windows-viewer-collision.json`.
Appearance: 90.001 wall s / 86.556 simulated s. Underside: 58.058 wall s / 56.012 simulated s.
Collision: 90.001 wall s / 87.358 simulated s. All used timestep 0.0001 s.

## Numerical checks and timing (separate from native inspection)

Python 3.12.10; MuJoCo 3.17.0; trimesh 5.2.0; NumPy 2.5.4.
Original and relocated bundle each pass 30,000 steps / 3 simulated seconds, timestep 0.0001 s.
First contact: 0.0639 s. Maximum transient penetration: 0.451507 mm (unchanged limit 1 mm).
Final bottom-height error: -0.000573621 mm. Settling limits pass; no Python/MuJoCo warnings.
Original simulation-loop wall time 1.128 s; original total 1.778 s; relocated total 1.542 s;
whole validation including copying/loading 3.338 s. Timings vary by run/host.
These dynamics resemble the old candidate because the same single box, mass and contact defaults
are used; geometry improvement is established by separate visual inspection, not that numeric match.

Input properties remain **estimated** full extents 43 x 27 x 58 mm and mass 59 g, not measurements
of the specimen. Friction remains null in the shared record and uses documented simulation defaults.
Independent scaling still changes proportions. `orientation.json` reports spread 5.427% relative
 to the maximum scale; the preparation note's 5.7% uses minimum-scale normalization. These are
consistent definitions, not measured reconstruction errors. A generic note says preparation applied
no rotation because the explicit +90-degree rotation occurred before preparation.

## Short drop/reset demo

`windows-evidence/drop-reset-demo.gif` is a real offscreen MuJoCo rendered replay, **not native
screen recording**. It shows two 20 mm drops with an explicit `mj_resetData` between cycles.
Reset time and qpos were verified against model defaults. Each cycle advances 0.999 simulated s,
0.0001 s timestep; total advanced time 1.998 s; 62 rendered frames; 9.4 s slow-motion playback
including initial holds; generation wall time 2.097 s. No warnings in either replay. Exact reset
state and timings are in `drop-reset-demo.json`. Native screenshots establish native viewer evidence.

## Reproduce (PowerShell, repository root)

```powershell
# Use a new extraction directory; original ZIP is unchanged.
Expand-Archive examples/simulation/apple-20w-charger-cleaned/simulation.zip outputs/charger-cleaned-windows
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.validate outputs/charger-cleaned-windows/scene.xml --report outputs/charger-cleaned-windows-validation.json
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene outputs/charger-cleaned-windows/scene.xml --azimuth 45 --elevation -20 --distance 0.18
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene outputs/charger-cleaned-windows/scene.xml --hide-ground --azimuth 45 --elevation 65 --distance 0.18
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene outputs/charger-cleaned-windows/scene.xml --collision --azimuth 45 --elevation -20 --distance 0.18
& .\.venv-sim\Scripts\python.exe tools/simulation/record_demo.py --scene outputs/charger-cleaned-windows/scene.xml --replays 2 --output outputs/charger-cleaned-drop-reset.gif
```

Close each native viewer before opening the next. `--hide-ground` changes rendering only.
The original extraction path above was new for this run; choose another on subsequent runs.

## Checks / next integration

Ruff lint/format and pip check pass. Full suite: 173 passed, 3 skipped in 24.43 s; two Windows
symlink-privilege skips and optional uagents_core absent. One upstream Starlette/httpx deprecation
warning. No simulation/runtime blocker was found for this candidate's stated demo scope.

The persistent reconstruction job is still awaiting_properties. This manually oriented bundle was
prepared/exported outside the API job flow, so do not claim that job completed. Johaan/Srijan should
carry the explicit orientation and dimension mapping into persistent preparation/orchestration before
assuming the normal process route reproduces this candidate. Preserve estimated provenance. Obtain
actual measurements for physical claims and coordinate richer collisions if pin contacts are needed.
No new paid reconstruction is needed for this acceptance result.
