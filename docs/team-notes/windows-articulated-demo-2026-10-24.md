# Windows articulated demo and stationary reference — 2026-10-24

Merged `d8305777ded0d762d2ecc1d1044c0c9bb26ca39f` into the Windows simulation
branch, preserving all earlier work and the pinned-model CRLF fix. No accepted
charger reconstruction, charger demo or combined-workspace tests were repeated.

## Synthetic assembly acceptance: complete

Python 3.12.10 / MuJoCo 3.17.0 / NumPy 2.5.4 / trimesh 5.2.0 /
Pydantic 2.14.1 / pytest 9.1.1, existing `.venv-sim`.

Requested assembly tests: **51 passed, 1 skipped in 8.78 s**. The skip is the
symlink-path case (Windows symlink privileges unavailable), not a motion failure.
Scoped Ruff lint/format and read-only helper guard checks passed.

Fresh export `outputs/assemblies/windows-hinge-20261024` passes both original
and exporter-managed relocation. Each location runs two six-second trials:
+0.4, -0.4, 0 radians for two seconds each; 1 ms timestep, 12,000 steps/location.
Wall times 0.298933 / 0.287583 s (validator loading/loop overhead included;
interpreter startup excluded). Max tracking error 7.21645e-16 rad; joint-limit
violation 0; zero MuJoCo/Python warnings; resets repeatable. Matches reported
Mac numerical tracking for this easy vertical-axis synthetic hinge. No tolerance changes.

Also copied ALL six generated files to a separate folder outside the Git checkout
and verified all SHA-256 values identical. Independently validated that copy,
including its own internal relocation: passed, 0.249917 / 0.261342 s. Both raw
reports remain untouched with viewer_inspected=false; separate native evidence
and windows-summary.json document actual GUI inspection.

Native MuJoCo viewer inspected on BOTH original and separately relocated scene:
Control panel drive_hinge set to -0.4 and +0.4; moving link visibly rotated in
opposite directions, while the fixed base stayed still. Backspace reset restored
zero drive and zero reference pose. A slider click near center initially produced
-0.008 rad; Backspace then confirmed exact displayed zero. Visual group 2 was
hidden and group 3 shown using number shortcuts to inspect orange box collisions
separately. All native screenshots include actual controls; no offscreen renderer
or synthetic picture substitutes. Both viewers closed cleanly. Geometry is
intentionally fixed above the ground; this is not gravity-compensation evidence.

Evidence under `examples/assemblies/two-link-hinge/windows/`:
- export-validation.json and relocated-validation.json
- windows-summary.json (versions, hashes, GUI findings)
- hinge-native-{positive,negative,reset,collision}.jpg
- hinge-relocated-{positive,negative,reset,collision}.jpg

Exact commands from simulation checkout (use fresh paths on repeats):

```powershell
& .\.venv-sim\Scripts\python.exe -m pytest -q tests/test_assemblies.py tests/test_assembly_export.py
& .\.venv-sim\Scripts\python.exe -m photo2sim.assemblies export examples/assemblies/two-link-hinge/input/assembly.json --output-dir outputs/assemblies/windows-hinge-20261024
& .\.venv-sim\Scripts\python.exe -m mujoco.viewer --mjcf outputs/assemblies/windows-hinge-20261024/scene.xml
# Control drive_hinge: +0.4 / -0.4; Backspace reset. Keys 2/3 toggle visual/collision groups.
$relocated = Join-Path $env:TEMP 'photo2sim-hinge-new-copy'
if (Test-Path -LiteralPath $relocated) { throw 'Choose a fresh directory' }
Copy-Item -LiteralPath outputs/assemblies/windows-hinge-20261024 -Destination $relocated -Recurse
& .\.venv-sim\Scripts\python.exe -m photo2sim.assemblies validate "$relocated/scene.xml" --report outputs/assemblies/relocated-hinge-new-report.json
& .\.venv-sim\Scripts\python.exe -m mujoco.viewer --mjcf "$relocated/scene.xml"
```

The actual persistent relocated directory used this run was
`C:\Users\ypira\.codex\visualizations\2026\10\24\01a16b93-2bdd-7881-b307-3de00db938cb\hinge-relocated-20261024`.
This synthetic example proves the reviewed parts/joints CLI product path only;
it is NOT an SO101 conversion/reconstruction. Adjacent-link contact filtering,
box collisions, uniform-box inertia and synthetic drive assumptions remain.

## Physical stationary readings: collected; photographs/measurements pending

Yash confirmed the robot was stationary and normal operator controls were NOT
running. No default trajectory was sent. Inspected actual installed source first:
Robot.connect would configure servos, so it was not used. Instead added
`tools/so101/capture_stationary.py`, which uses the existing LeRobot SerialMotorsBus
for handshake/read operations only. Its public write, sync_write, write_calibration,
enable_torque and disable_torque entry points reject calls. Disconnect explicitly
uses disable_torque=False. No Robot instance, configure(), send_action(), torque
change, homing/calibration write, gain change or motor motion command was used.
No new packages or modifications to the LeRobot environment/source.

COM5 and COM6 serial adapters were enumerated read-only. Opened historical follower
COM5, IDs 1–6 STS3215, and compared calibration registers read from hardware to the
existing hackathon_follower JSON: EXACT VALUE MATCH for every field/motor.
Closed COM5 after capture without torque changes. LeRobot source remains clean at
146d8474932c8b566717eb2738ba459337ab71c4, version 0.6.2, Python 3.12.10.

Capture: **599 samples**, 4.99012 successful samples/s over recorded span
119.8367485 s. First read 2026-10-24T09:10:09.087750Z, last read finished
09:12:08.926450Z (02:10:09–02:12:08 America/Los_Angeles). Each row has UTC read
start/end, elapsed monotonic time, duration, raw encoder counts and named normalized
positions from the SAME raw read. Serial grouped reads are not a simultaneous
hardware timestamp; phone frames are not synchronized. All reported six values
were constant throughout this interval:

| Joint | Reader value | Unit |
|---|---:|---|
| shoulder_pan.pos | -1.45054945 | degrees |
| shoulder_lift.pos | -104.17582418 | degrees |
| elbow_flex.pos | 96.17582418 | degrees |
| wrist_flex.pos | 84.04395604 | degrees |
| wrist_roll.pos | 4.17582418 | degrees |
| gripper.pos | 0.95497954 | calibrated normalized 0–100 |

The reader explicitly uses use_degrees=True equivalent normalization for the first
five motors; gripper remains 0–100. There was no running teleop process/config to
read back. This is not a measured jaw gap or gripper angle. Shoulder-lift value
is outside the reference model limit: do not replay or silently clip into simulation.

Small full capture evidence committed under `examples/so101/windows/reference-20261024/`:
- capture.json: IDs/config identity, actual hardware calibration, explicit units
- calibration.json: exact original JSON; SHA-256
  17db9518c585eec7fd5a28a436699c9824355e22816ccb9488d1ee6dc9682237
- observations.jsonl: all 599 rows (no read failures reported)
- summary.json: rate/ranges, missing photo/measurement fields

Git-byte preservation correction: earlier calibration/metadata source files had
correct local bytes but Git normalized them when storing. New scoped
examples/so101/windows/.gitattributes preserves exact follower/leader calibration,
first-demo-info.json and reference calibration bytes. Motor values are unchanged;
committed hashes now match the previously reported original-file hashes.

Exact read command used (existing LeRobot interpreter, DOCUMENTED FOR COORDINATED
stationary capture, not unattended motion):

```powershell
& "$env:USERPROFILE\lerobot-env\Scripts\python.exe" tools/so101/capture_stationary.py --port COM5 --calibration "$env:USERPROFILE\.cache\huggingface\lerobot\calibration\robots\so_follower\hackathon_follower.json" --source "$env:USERPROFILE\lerobot" --output-dir outputs/so101/reference-capture-20261024 --seconds 120
```

Reader is pinned to the inspected LeRobot SHA; source/path/cleanliness checks refuse
other source states. Latest source/path guards were added after the successful
capture; they were not necessary to its read loop. Five write/torque guards and
preserve-torque disconnect behavior were checked with mocks without a connection.

## Missing evidence and next operator step

No physical photos have been attached yet. Requested whole FOLLOWER front/side
views including base, plus gripper, camera bracket and mounting details; photos
must be associated with this interval only if the operator confirms their timing
and unchanged pose. Otherwise obtain a NEW coordinated stationary read window.
Do not label later images as synchronized with this capture. No actual jaw opening,
base/table distance, visible reference endpoints or uncertainties supplied yet;
all remain unknown. Yash's earlier statement establishes stationary pose before
capture; confirmation over the whole capture/photo interval is still pending.

No requested or actually sent actions exist in this read-only session; they remain
null. For later operator-led motion, instrument the existing record loop in a
reviewed change: monotonic/UTC read intervals, observed state, teleop requested
values before clipping, send_action return after clipping, and frame timestamps.
It currently discards _sent_action. Do not modify LeRobot or start a trajectory
merely to fill these fields. Additional poses must use Yash's established controls,
followed by coordinated stationary capture. One pose cannot establish all joint
signs/zeros; gripper angle conversion and CAD/physical match remain unverified.

Next: receive original photos and measurement endpoint descriptions, associate
stationary views honestly, then Johaan can use them alongside his CAD review.
Assembly acceptance is complete; physical reference pairing is not complete.

## Operator-requested stationary repeat (take 2)

Yash requested a repeat after the initial handoff. Reused the same read-only helper,
COM5 and existing calibration for another 120-second capture. Saved 599 observations
under `examples/so101/windows/reference-20261024-take2/`; exact UTC/Pacific interval,
measured sample rate and ranges are in summary.json. Calibration readback again
matched the source JSON; no error was reported. Port closed without torque changes.
No operator controls, trajectory, calibration or additional simulation tests were run.
Original take remains preserved. Photos and operator confirmation of unchanged pose
and photo timing are pending; do not pair later images with either take by assumption.
