# Windows API SO101 acceptance and take-3 candidate comparison — 2026-10-24

## Repository and actual API archive

Merged backend `61d5f3e56819a4905b5d1f4cedb28df0206cae4e` into
`codex/windows-simulation-setup`. One add/add .gitattributes conflict contained
different comments and the SAME `* -text` rule; resolved by keeping exact pinned-byte
protection. Original take-3 data/photos/pairing remain unchanged and labeled
operator-confirmed stationary association, NOT hardware-synchronized.

Read docs/handoffs/yash-so101-api-workflow.md and the API-workflow README. Extracted
the actual API-downloaded simulation.zip into fresh
`outputs/so101-api-windows-take3-comparison`. Verified 31,253,228 bytes and SHA-256
`aff9c1a3a7690e8cafcae30eaa37ce5b33c82d7b46621dc51741fd05311344b0`
against acceptance.json. This is a generated CAD/template-assisted API export;
photos did not generate its meshes/joints. No charger work, API job submission,
Meshy call, hardware connection or calibration change was performed.

## Windows validation / viewer: pass

Existing .venv-sim: Python 3.12.10, MuJoCo 3.17.0, NumPy 2.5.4,
trimesh 5.2.0, Pydantic 2.14.1.

Original and validator-managed relocated copies pass, each with two 36-second
six-joint positive/negative/zero trials (72 simulated seconds per location,
72,000 steps at 0.001 s). Max phase-end tracking error
**0.0006168732167133317 rad**, below unchanged 0.03 rad tolerance. Zero MuJoCo/Python
warnings, zero joint-limit violation, reset repeatable. Wall times 7.248961 s
original / 6.970690 s relocated including load/check loop, excluding Python startup.
Matches the reported Mac API result to recorded precision.

Template FK passes: max body position difference 2.498001805406602e-16 m,
rotation-matrix-element 1.7763568394002505e-15, joint-axis-element
1.9984014443252818e-15. This checks the same template, not independent physical accuracy.

Requested scripted replay/render passes: four two-second phases (8 simulated
seconds / 8,000 steps), max phase-end error 0.000500116502431499 rad, zero warnings.
The GIF is labeled OFFSCREEN SIMULATED MOTION, not native viewer or real-arm
footage. Total replay wall time was not separately recorded. Focused motion tests:
9 passed, 1 skipped (Windows symlink privileges unavailable) in 2.13 s. New offline
comparison tool passes scoped Ruff lint/format.

Native API archive appearance and separate collision invocation both inspected:
blue seven-link structural grouping and jaws render; orange convex hulls fill
concavities as expected. Servos, fasteners, electronics/camera/mount and physical
clamp/table visuals are omitted from this structural subset. No load/render error
or crash; viewers closed cleanly. Native screenshots are initial static views;
full dynamics are verified separately by validator and labeled offscreen replay.
Do not call the static screenshots a native motion recording.

Root height **0.15 m remains ASSUMED free-space clearance**, not measured mounting.
Convex hulls, direct parent-child exclusions, uniform-box inertia and approximate
actuators remain active. Ground/nonadjacent contact policy remains enabled. No
collision policy, dynamics, threshold or shared exporter/validator changed.

API evidence under `examples/assemblies/so101-guided/api-workflow/windows/`:
- validation.json, template-fk.json, windows-summary.json
- native-appearance.jpg, native-collision.jpg
- motion/{actions.json,preflight.json,report.json,trace.json,replay.gif}

## Take-3 observations and variation

599 samples, 119.843621 s span, approximately 4.989836 Hz;
2026-10-24 05:20:46–05:22:45 America/Los_Angeles. Exact calibration/config identity
and original photos remain in the parent reference directory. No new motor reads.

| Joint | Median (=min=max) | Span | Declared unit | Candidate A/B body q, rad |
|---|---:|---:|---|---:|
| shoulder_pan | -0.39560440 | 0 | degrees | -0.00690460 |
| shoulder_lift | -104.17582418 | 0 | degrees | -1.81821113 |
| elbow_flex | 96.17582418 | 0 | degrees | 1.67858479 |
| wrist_flex | 84.04395604 | 0 | degrees | 1.46684375 |
| wrist_roll | 4.17582418 | 0 | degrees | 0.07288188 |
| gripper | 0.95497954 | 0 | calibrated normalized 0–100 | see alternatives |

Zero reported span describes quantized observations, not a sub-encoder physical
motion/noise bound. No requested/sent actions exist in this stationary read-only
take. Those fields are not replaced with observed positions or guessed targets.

## Candidate comparison: assumptions, NOT verified mapping

Added `tools/so101/compare_stationary_pose.py` and ran it against the actual API
scene. All five body joints use ASSUMED sign +1, offset 0 and scale pi/180. These
signs/offsets were not fitted or verified. Source unit declarations come from the
inspected capture producer, not from photographs.

Two separate gripper hypotheses, neither adopted:
- A: linearly map normalized 0–100 across model limits [about -10,100] degrees;
  q = low + value*(high-low)/100 = **-0.156198709 rad** for take 3.
- B: treat the normalized number as a degree-valued angle purely as an alternative
  heuristic; q = value*pi/180 = **+0.016667537 rad**. This does not mean the hardware
  normalized signal actually measures degrees.

Both candidates preserve the body values UNCLIPPED. Direct shoulder_lift is
0.072881833 rad (about 4.17582 degrees) BELOW the model lower limit -1.7453293 rad.
This is prominently reported and labeled on every render. Only mj_forward was
used: no stepping, control targets or hardware commands. These renderings do not
show a dynamically valid pose inside model limits. The mismatch must be resolved
through reference evidence; do not silently clip or rewrite calibration to fit.

Four labeled offscreen candidate views (two arbitrary camera directions per
hypothesis) broadly reproduce the folded-down configuration seen in take 3.
Gripper appearance differs between hypotheses. This is qualitative morphology,
not a pixel registration or metric pose-fit score. Cameras are not matched to
phone intrinsics/extrinsics, root remains assumed 0.15 m, and photographs were
not altered or mirrored. No hypothesis is selected as the correct mapping.

Comparison evidence:
`examples/so101/windows/reference-20261024-take3/model-comparison/`
contains comparison.json, operator-review.json and four labeled PNG renders.
Original capture/pairing/photos and calibration were not edited.

## Mirror confirmation and measurements: still pending

Asked Yash whether each photo used rear/selfie camera and whether either was
horizontally flipped. No answer received at publication. Both mirror statuses
remain UNKNOWN in operator-review.json. Front background lettering looks reversed,
but that alone cannot distinguish pixel mirroring from a reversed/backside sign.
No joint direction/sign is inferred from either photo before reliable confirmation.
Do not horizontally flip an image merely to make a candidate look correct.

Asked for ruler-measured inner jaw gap, tabletop-to-identifiable-base reference
height, endpoint description/photos, and whether the arm is still in take-3 pose.
No measurements or pose-continuity answer supplied. Jaw opening, tabletop height,
thickness, base/world translation/orientation and camera extrinsics remain UNKNOWN.
A later jaw measurement cannot be assigned to take 3 if its pose changed/continuity
is uncertain. No dimensions were inferred from the photographed clamp or fingertips.

Physical differences visible in the photos: real servos/wiring and black/orange
clamp; wrist camera/PCB/lens on a projecting mount. Generated structural model
omits those visuals. Nominal mass may include omitted hardware but inertia remains
approximate. Actual mount revision/offsets and their effect on mass/TCP remain
unverified. The simulation root Z=0.15 m is not adopted as physical placement.

## What remains ambiguous / useful future reference evidence

All six sign/zero mappings remain unverified; one pose cannot separate sign from
offset. For each body joint, a second human-chosen pose changing that joint while
others stay approximately fixed, with known unmirrored view and base reference,
can establish motion direction. An identifiable geometric reference pose and
measured/registered views are needed for zero offsets. This is a proposed future
operator-led procedure, not a new motion instruction executed by the agent.

- Pan: near-zero reading plus unknown base/world yaw does not establish sign/zero;
  needs base axes and a distinct pan pose.
- Lift/elbow/wrist flex: folded geometry and occlusion leave offset alternatives;
  need separated views/distinct poses, especially to resolve the lift limit mismatch.
- Wrist roll: use an asymmetric visible marker or confirmed camera bracket face
  in distinct operator poses; symmetric link silhouettes can hide rotation.
- Gripper: measure gap and identify jaw geometry in at least closed-reference and
  another opening (a third opening checks nonlinearity). Fit angle/gap using actual
  geometry; normalized percent is not necessarily linear in gap or model angle.
- Base/table: measure endpoints tied to an identifiable CAD/model base reference,
  tabletop plane and orientation; table height alone is not a base/world transform.

No sign/offset, jaw conversion or dynamics change is approved by this comparison.
Physical accuracy remains unverified while API numerical acceptance is complete.

## Exact commands (existing environment; choose fresh output paths on repeat)

```powershell
& .\.venv-sim\Scripts\python.exe -m zipfile -e examples/assemblies/so101-guided/api-workflow/simulation.zip outputs/so101-api-windows-take3-comparison
& .\.venv-sim\Scripts\python.exe -m photo2sim.assemblies validate outputs/so101-api-windows-take3-comparison/scene.xml --report outputs/so101-api-windows-validation.json
& .\.venv-sim\Scripts\python.exe tools/assemblies/check_so101_template.py outputs/so101-api-windows-take3-comparison/scene.xml --root-z-offset 0.15 --report outputs/so101-api-windows-template.json
& .\.venv-sim\Scripts\python.exe -m photo2sim.assemblies.motion outputs/so101-api-windows-take3-comparison/scene.xml examples/assemblies/so101-guided/collision-revision/demo-actions.json --output-dir outputs/so101-api-windows-motion --render
& .\.venv-sim\Scripts\python.exe tools/assemblies/view_motion_check.py outputs/so101-api-windows-take3-comparison/scene.xml --events outputs/so101-api-native-appearance.jsonl
# Inspect then close; the dynamic replay above is separately labeled offscreen.
& .\.venv-sim\Scripts\python.exe tools/assemblies/view_motion_check.py outputs/so101-api-windows-take3-comparison/scene.xml --events outputs/so101-api-native-collision.jsonl --collision
& .\.venv-sim\Scripts\python.exe tools/so101/compare_stationary_pose.py outputs/so101-api-windows-take3-comparison/scene.xml examples/so101/windows/reference-20261024-take3 --output-dir outputs/so101-take3-model-comparison
& .\.venv-sim\Scripts\python.exe -m pytest -q tests/test_assembly_motion.py
```
