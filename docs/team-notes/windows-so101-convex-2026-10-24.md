# Windows generated-SO101 convex collision acceptance — 2026-10-24

## Revision and scope

Merged origin/codex/backend-pipeline at
`60e60f956c2336910b6bd50fdfb903d7a39c9485` into the clean
`codex/windows-simulation-setup` branch. Existing Windows fixes, all original failed
candidate evidence, calibration, CAD and captures are preserved. No shared
exporter/validator changes. No motor connection, command, recalibration, new
unpaired capture, Meshy job or charger test was performed.

Read collision-revision/README.md before extracting its bundle.zip into NEW folder
`outputs/assemblies/so101-convex-windows-20261024`. Archive SHA-256 matches
`ec1b90f25740e806c24ad1e871c1bb364abc33584f58b1de74d8e8900e175eda`.
This is the GENERATED CAD/template-assisted assembly. The imported reference is
used only by the FK consistency check. It is not a new reconstruction of the
physical arm, and template agreement is not independent physical validation.

## Numerical acceptance: pass without parameter/threshold changes

Existing simulation interpreter `.venv-sim/Scripts/python.exe`: Python 3.12.10,
MuJoCo 3.17.0, NumPy 2.5.4, trimesh 5.2.0, Pydantic 2.14.1.

`motion-validation.json` preserves original AND internally relocated runs. Each
location has two 36-second trials, six joints x three targets x two seconds:
positive half-limit, negative half-limit, zero, with other controls zero.
Timestep 0.001 s, 2,000 steps/phase; 72,000 steps / 72 simulated seconds per
location. Original wall time 7.372159 s, relocated 7.522577 s (load/validation loop
included, interpreter startup excluded). Both pass finite state, actual joint
motion, limits, tracking, repeatable resets and warning checks.

Max phase-end tracking error **0.0006168732167134428 rad**, versus unchanged 0.03 rad
tolerance. Worst phase: shoulder_lift target +0.87266465 rad, actual
+0.8732815232167135 rad. Zero warnings/Python warnings and zero joint-limit
violation. Windows matches the reported Mac error to the stated precision.
No tolerance, target, duration, gain, mass or inertia was altered for acceptance.

Template FK: maximum position error 2.77555756e-16 m; rotation matrix element
error 1.77635684e-15, axis element error 1.99840144e-15. Passes unchanged 1e-10
comparison. Uses root Z offset **0.15 m**, an ASSUMED FREE-SPACE TEST PLACEMENT.
Do not reuse this height for the real table/arm without measurement. The previous
0.05 m candidate's floor intersection and failed reports remain retained.

Six existing convex/collision regression tests pass (24 deselected) in 1.60 s.
New native playback helper passes scoped Ruff lint and formatting. No other
already accepted charger/reference-workspace suites were repeated.

## Native viewer and contact policy: inspected

Added `tools/assemblies/view_motion_check.py` as a simulation-only native viewer
helper. Space plays the validator's exact two-trial target sequence; R resets and
stops; close exits. It imports no robot libraries. It loads the exact extracted
scene and steps in batches at the scene's unchanged timestep, completing exactly
2,000 integration steps per phase. Native playback completed 36 phase endpoints
(72 simulated seconds across two resets). All 36 joint/target/actual tuples match
the validator report EXACTLY, including max error 0.0006168732167134428 rad and
zero warnings. R subsequently restored qpos/ctrl all zero at simulation time zero.
Raw native telemetry is preserved separately, not edited into the validator report.

Observed blue structural links and moving jaws grouped into the seven named links;
positive and negative movement changes the corresponding groups coherently.
Expected omissions: servo, fastener and camera geometry are absent from this
structural CAD subset. Lighting is dark; screenshots are native viewport captures,
not independent metrology. Initial, sequence-complete and R-reset screenshots show
similar nominal poses because each sequence finishes at zero targets. Motion
endpoints are documented by native telemetry; screenshots alone do not prove all
transient behavior. No video captured. Native visual and collision viewers closed
cleanly; no crash, visible instability or missing-mesh load error observed.

Separate collision invocation hides visual group 2 and shows collision group 3,
with MuJoCo's mjVIS_CONVEXHULL flag enabled. Orange hull screenshot clearly fills
holes/concavities and differs from the detailed visual structure. This is a hull
view, not the original concave mesh misrepresented as a contact surface.

`contact-policy.json` checks both XML and compiled model:
- Seven collision geoms are meshes with computed convex-hull graphs.
- Exactly six explicit exclusions, each corresponding to a joint-connected pair;
  compiled exclusion count six. No extra nonadjacent exclusions.
- Ground and link collision contype/conaffinity are all 1; disableflags=0.
- Visual groups do not collide. Ground/nonadjacent contacts remain enabled by
  policy; this is not exhaustive evidence of every possible contact configuration.

Hulls fill concavities; adjacent collisions are excluded, so this cannot predict
housing interference/mechanical joint stops. Approximate cuboid inertia,
template-derived frames/masses/axes and uncalibrated drives remain assumptions.

## Evidence and exact commands

Small committed evidence under
`examples/assemblies/so101-guided/collision-revision/windows/`:
`motion-validation.json`, `template-fk.json`, `contact-policy.json`,
`native-motion.jsonl`, `native-collision.jsonl`, `windows-summary.json`,
`native-initial.jpg`, `native-complete.jpg`, `native-reset.jpg`, `native-hulls.jpg`.
Raw CLI reports initially written under outputs/ were copied unchanged.
Validator reports retain viewer_inspected=false (automated scope); the separate
Windows summary records the subsequent actual viewer inspection.

From the simulation checkout, choose new paths on repeats:

```powershell
Expand-Archive -LiteralPath examples/assemblies/so101-guided/collision-revision/bundle.zip -DestinationPath outputs/assemblies/so101-convex-windows-20261024
& .\.venv-sim\Scripts\python.exe -m photo2sim.assemblies validate outputs/assemblies/so101-convex-windows-20261024/scene.xml --report outputs/so101-convex-windows.json
& .\.venv-sim\Scripts\python.exe tools/assemblies/check_so101_template.py outputs/assemblies/so101-convex-windows-20261024/scene.xml --root-z-offset 0.15 --report outputs/so101-convex-fk-windows.json
& .\.venv-sim\Scripts\python.exe tools/assemblies/view_motion_check.py outputs/assemblies/so101-convex-windows-20261024/scene.xml --events outputs/so101-convex-native-motion.jsonl
# Focus viewer, Space starts two exact trials; afterward R resets, close viewer.
& .\.venv-sim\Scripts\python.exe tools/assemblies/view_motion_check.py outputs/assemblies/so101-convex-windows-20261024/scene.xml --events outputs/so101-convex-native-collision.jsonl --collision
# Inspect hulls; close. No second motion sequence needed for this view.
& .\.venv-sim\Scripts\python.exe -m pytest -q tests/test_assembly_export.py -k convex
```

## Physical reference/mapping: still unpaired, no new capture

Yash replied that the take-2 photo association is uncertain and requested clearer
instructions. Added ONLY `examples/so101/windows/reference-20261024-take2/pairing.json`:
status unpaired, images=[], image times unknown, unchanged-pose confirmation null,
association method null, hardware_synchronized=false. Preserved all four original
take-2 files and the independent offline audit unchanged. No association invented.

Timestamped observations: existing take 2, 599 complete readings at approximately
4.99 Hz, 2026-10-24 04:43:52–04:45:52 America/Los_Angeles. First five source values
are degrees, gripper normalized 0–100, with calibration/config/hash identity saved.
This session adds no new hardware observations or action data. Requested and
actually sent actions remain distinct/unavailable for this stationary read-only
take. Hardware joint signs/zeros remain unverified. Gripper conversion to angle or
jaw distance remains unverified. Measured base/table transform, mounting height,
jaw opening, measurement endpoints/uncertainties and physical modifications remain
unknown. In particular the test root Z=0.15 m is NOT any such measurement.

Explained new pairing workflow plainly: keep follower stationary, controls closed,
get phone ready, say 'ready for paired capture'; only then coordinate a fresh
read-only interval with whole-follower front/side photos including base. Attach
original images and confirm unchanged pose through that interval. Optional ruler
photos: inner jaw gap in mm, tabletop height from floor and table thickness, with
visible endpoints; additional base-reference offsets needed for a full transform.
These simple dimensions alone do not calibrate the base/world orientation.
No more unpaired captures will be run. Any additional distinct pose must use the
human operator's established controls; never send simulated zero or guessed mapping.

Next: Johaan may integrate this numerical/viewer acceptance. Physical comparison
must wait for honestly paired images/readings and measured mounting geometry;
no physical accuracy claim follows from this pass.
