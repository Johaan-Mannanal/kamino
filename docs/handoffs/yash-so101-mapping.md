# Yash: SO101 inventory for live real-versus-simulation comparison

Your API-produced charger ZIP acceptance is complete, reported at
`eaa705cef28083abdd2b0af9f570e7659f5ae836`. Original/relocated validation, native
appearance and saved +90° X orientation passed. No repeated charger demo or
Meshy reconstruction is needed. Keep its estimated properties and single-box
collision limitations documented.

Next, focus on the following SO101 inventory. Johaan has pushed the model setup
at `3ca9c3e` and is integrating the frontend separately. We need the following
Windows evidence before matching real and simulated arm motion.

## 1. Synchronize without losing work

In your clean simulation checkout on `codex/windows-simulation-setup`, fetch and
merge `origin/codex/backend-pipeline`. If dirty, preserve/commit your own work
first; do not reset or discard changes. Keep the existing LeRobot environment,
calibration, recordings, and camera work intact. Do not merge into main.

## 2. Inventory existing files and source; no robot connection needed

Use the actual LeRobot interpreter, previously
`C:\Users\ypira\lerobot-env\Scripts\python.exe`, and source checkout,
previously `C:\Users\ypira\lerobot`.

Record:

- Python and LeRobot versions, imported source path, current Git SHA and local
  changes. Previously reported source SHA was
  `146d8474932c8b566717eb2738ba459337ab71c4`.
- The actual follower launch command/config: robot type, robot ID, serial port,
  effective `use_degrees`, `max_relative_target`, servo gains and any processors
  that transform observations/actions. Separate defaults from runtime overrides.
- All six motor names, motor IDs/models, action/observation keys and their units,
  as established from the installed source/config. At the reported SHA the code
  lives under `robots/so_follower/`, not `robots/so101_follower/`.
- The existing follower calibration JSON actually associated with this robot ID:
  preserve an exact copy and SHA-256. Include each motor's `id`, `drive_mode`,
  `homing_offset`, `range_min`, and `range_max`. State how the file was identified;
  mark unresolved if several files could apply. Do not recalibrate to obtain it.
- Whether calibration used the old or new midpoint procedure, if known. Unknown
  is useful; do not infer this from the arm being an SO101.
- Available leader/teleoperation setup and the known working operator workflow.

At the previously reported SHA, `use_degrees=True` gives degrees for the first
five joints, but **gripper remains normalized 0–100**. False gives normalized
-100–100 for the first five. Confirm this on your actual environment.

Do not instantiate/connect a robot just to inspect it: `connect()` can configure
servos and calibration. This inventory must not write Goal_Position, toggle
torque, change gains/offsets, or invoke setup/calibration.

## 3. Export an existing pose/recording sample, if available

Inspect `first-demo` or another existing recording without modifying it. Supply:

- Feature metadata/order and provenance for units; record the collection-time
  config if it differs from the currently installed software.
- A short timestamped observation sequence with named six-joint positions.
- Recorded requested actions and actually sent/clipped actions, if available.
  Keep these distinct from observations; mark missing fields as unavailable.
- Matching frame(s) showing the arm and corresponding timestamps. An external
  view is preferable for pose comparison; wrist footage alone may not show the
  arm posture. Do not invent synchronization if it was not recorded.

No new motion is needed for this initial handoff. If existing data cannot establish
pose/sign/zero, report what is missing and we will coordinate an operator-led
reference-pose capture separately. Never send the simulated zero pose to hardware.

Ask Yash to supply available measurements/photos of base mounting, table surface,
gripper/camera modifications, and object placement relative to the base. Mark
estimates as estimates. Full workspace calibration can follow this inventory.

## 4. Check the pinned model in your separate simulation environment

From the simulation checkout (choose a new report path if it exists):

```powershell
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.so101 --report outputs/so101/windows-model-inspection.json
& .\.venv-sim\Scripts\python.exe -m mujoco.viewer --mjcf third_party/robotstudio_so101/scene.xml
```

Inspect the model against our physical arm: link layout, gripper, wrist-camera
mount and base orientation. Save native screenshots, report actual differences,
and record MuJoCo version. This opens a simulated model only. The inspector's
success establishes numerical loading/holding, not hardware calibration.

## 5. Return a portable handoff

Commit and push a handoff under `docs/team-notes/` and small supporting files
under `examples/so101/windows/` on your simulation branch. Exclude service keys,
unrelated personal data, large raw datasets and machine-specific credential files.
An appropriate robot calibration copy is useful; a path string alone is not.

Return branch, full SHA, test/viewer results, exact file paths, unit/config
findings, and missing evidence. Clearly label each conclusion as source/config,
recording-derived, operator-confirmed, or still unknown. Output a concise block
for Johaan to paste into the other computer's chat.
