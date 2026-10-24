# Windows SO101 mapping inventory — 2026-10-24

## Scope and evidence

Merged backend `cc9e2476199c61f438b646b8adeaad32551171a6` (includes SO101 setup
`3ca9c3e`) into `codex/windows-simulation-setup`. Charger acceptance remains closed.
No robot/bus connection, motor command, torque toggle, calibration, gain write,
package change, or new recording was performed. Existing robot/camera work remains intact.

Supporting evidence is committed under `examples/so101/windows/`:
`inventory.json`, exact `hackathon_follower.json` and `hackathon_leader.json`,
`first-demo-info.json`, `first-demo-sample.csv`, `model-inspection.json`, and
`so101-native-overview.jpg` / `so101-native-gripper-camera.jpg`.
The two screenshots show the same native overview; mouse navigation did not
produce a useful second angle. They are not photographs of hardware.

## Installed software and recovered configuration (source/config evidence)

Robot interpreter: `C:\Users\ypira\lerobot-env\Scripts\python.exe`, Python 3.12.10.
LeRobot 0.6.2 imports from `C:\Users\ypira\lerobot\src\lerobot\__init__.py`.
Source Git SHA `146d8474932c8b566717eb2738ba459337ab71c4`; checkout clean.
SO101Follower aliases SOFollower (`robots/so_follower/`), whose name is `so_follower`.

Narrow inspection of local shell history recovered the following known operator
workflow (DOCUMENTATION ONLY; do not execute for this inventory):

```powershell
& "$env:USERPROFILE\lerobot-env\Scripts\lerobot-teleoperate.exe" --robot.type=so101_follower --robot.port=COM5 --robot.id=hackathon_follower --robot.max_relative_target=5.0 --teleop.type=so101_leader --teleop.port=COM6 --teleop.id=hackathon_leader --fps=30
```

The recorded command used the same robot/teleop flags, `dataset.repo_id=local/so101_first_demo`,
`dataset.fps=30`, `dataset.episode_time_s=20`, `dataset.num_episodes=1`,
`dataset.video=false`. No use_degrees, gain, processor, or calibration_dir override
was recovered. Earlier teleoperation used max_relative_target=3; later commands use 5.
History has no command timestamps. Ports are historical, not newly probed.

Current follower AND leader default `use_degrees=True`: first five joints use
DEGREES, gripper ALWAYS uses RANGE_0_100. Under that source and the recovered
command, effective use_degrees is True. This is not a readback of a running process
or definitive proof of capture-time software/config, which was not persisted.

| Motor / vector order | ID | Model | Observation and action key | Current configured units |
|---|---:|---|---|---|
| shoulder_pan | 1 | sts3215 | shoulder_pan.pos | degrees |
| shoulder_lift | 2 | sts3215 | shoulder_lift.pos | degrees |
| elbow_flex | 3 | sts3215 | elbow_flex.pos | degrees |
| wrist_flex | 4 | sts3215 | wrist_flex.pos | degrees |
| wrist_roll | 5 | sts3215 | wrist_roll.pos | degrees |
| gripper | 6 | sts3215 | gripper.pos | calibrated normalized 0–100 |

False use_degrees would give -100–100 for the first five joints. Observations read
Present_Position; actions request Goal_Position. Leader has the same six IDs,
models, default normalization and key order. Current default processors in
`processor/factory.py` are IdentityProcessorStep pipelines; no scaling is added.

Follower default gains P=16, I=0, D=32; max_relative_target defaults None, overridden
5.0 in recovered commands. Read retries=2; disable_torque_on_disconnect=True.
These are source defaults/launch overrides, not current servo readbacks.
The 5.0 limit is per send relative to newly read position, in each motor's configured
units: degrees for body joints, normalized points for gripper; not a velocity limit.

`motors/motors_bus.py` degrees normalization uses
`(raw - (range_min + range_max)/2) * 360 / (model_resolution - 1)`;
range-normalized modes clamp to calibrated bounds and apply software inversion
when applicable. Homing offsets and drive_mode are in the exact calibration copy.
Do not interpret calibrated hardware zero/sign as model zero/sign without pose evidence.

## Calibration (existing file evidence)

Follower source file resolved from the actual imported HF_LEROBOT_CALIBRATION
constant: `%USERPROFILE%\.cache\huggingface\lerobot\calibration\robots\so_follower\hackathon_follower.json`.
Matched recovered robot ID and SOFollower.name; only one matching follower file
was found. No calibration_dir override was recovered. EEPROM agreement was not
checked because this inventory does not connect hardware.

Exact follower copy SHA-256:
`17db9518c585eec7fd5a28a436699c9824355e22816ccb9488d1ee6dc9682237`.

| Motor | id | drive_mode | homing_offset | range_min | range_max |
|---|---:|---:|---:|---:|---:|
| shoulder_pan | 1 | 0 | -1655 | 745 | 3444 |
| shoulder_lift | 2 | 0 | 1217 | 948 | 3342 |
| elbow_flex | 3 | 0 | -1316 | 796 | 2994 |
| wrist_flex | 4 | 0 | -1617 | 933 | 2935 |
| wrist_roll | 5 | 0 | -1438 | 0 | 4095 |
| gripper | 6 | 0 | 335 | 2041 | 3507 |

Leader copy SHA-256:
`9ea3d1e38a96cc8b3a10e3ca9ba64f774c1bc6d82ee4e26707034541a77e741d`.
Old/new midpoint calibration procedure is UNKNOWN. Current calibration source uses
a midpoint prompt and half-turn homings, but the existing JSON does not prove which
procedure generated it. No recalibration attempted.

## Existing recording (recording-derived evidence)

`%USERPROFILE%\so101-demos\first-demo` contains one 600-row episode at nominal
30 FPS, 20 s; stored timestamps 0 to 19.96666717529297 s. `codebase_version=v3.0`
is dataset format metadata, not the capture Git SHA. Named action/observation
vectors are float32, six values in the table order. Original metadata copied exactly.
Sample CSV preserves frames 0–90 inclusive and 150, 300, 450, 599 (95 rows).
Source parquet SHA-256 is in inventory.json. No large raw dataset committed.

Timestamps are nominal frame_index/fps in current dataset_writer.py, not measured
wall-clock sample times. Exact capture-time config and source SHA are unavailable.
Recovered recording command plus current source support degree-body/normalized-gripper
interpretation; this is qualified provenance, not inference from value magnitudes.

IMPORTANT: current lerobot_record.py saves `action_values` from the teleop pipeline
before robot send_action. `_sent_action` returned by send_action is not saved,
despite a nearby comment. With identity processors these are requested targets;
safety-clipped actually sent actions are UNAVAILABLE. Observations remain separate.

No camera feature, video_path=null, and no matching arm frames/video were found in
this dataset. Existing wrist-preview images are separate sessions, not synchronized
full-arm pose evidence. They cannot establish joint sign/zero alignment. Task label:
'Slowly open and close the gripper, then return to the starting pose'.
Observed shoulder_lift reaches about -103.736 degrees under the qualified unit
interpretation, outside the model's -100 degree limit: do not directly replay or
silently clip this sequence into the model.

## Windows model check (simulation evidence)

Simulation interpreter: this checkout's `.venv-sim\Scripts\python.exe`, Python 3.12.10.
MuJoCo 3.17.0, numpy 2.5.4, trimesh 5.2.0.
Pinned Menagerie source `f3b6013629c7b94f8ee93fd977b161fa8350f9bc`,
SO101 new-calibration variant; see third_party/robotstudio_so101/SOURCE.json.

Headless: nq=nv=nu=6; 400 steps at 0.005 s, simulated duration approximately 2 s,
wall-clock 0.151431 s for inspect_model (model load + stepping; excludes Python
startup/imports). Finite state true, warning_count=0, no Python warnings,
max hold deviation 0.000847973 rad. numerical_smoke_passed=true;
hardware_mapping_verified=false. JSON contains limits, addresses and frame locations.

Native viewer: opened actual scene with MuJoCo's native viewer, visually inspected,
captured screenshots and closed cleanly. Yellow links, six-joint chain, open gripper,
base, and a dark wrist camera/lens assembly rendered without missing visual assets.
Base is fixed above the model ground; model base quaternion identity is not a
measured table/world transform. Layout is plausible for SO101, but physical link,
gripper pad, camera bracket, and mounting revision comparison is UNVERIFIED because
no suitable full-arm photograph or measured mounting data exists in this evidence.
The two image files are overview evidence, not calibrated multi-view comparisons.

Model qpos and position-actuator controls are radians for ALL six joints, including
gripper. Hardware gripper 0–100 is NOT directly radians/degrees. baseframe,
gripperframe and wrist_cam are model references, not measured TCP/camera extrinsics.
No degree-to-radian replay adapter is approved by this numerical smoke test.

Reproduce from the simulation checkout (choose a fresh report path):

```powershell
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.so101 --report outputs/so101/windows-inventory-repeat.json
& .\.venv-sim\Scripts\python.exe -m mujoco.viewer --mjcf third_party/robotstudio_so101/scene.xml
& .\.venv-sim\Scripts\python.exe -m pytest tests/test_so101.py
& .\.venv-sim\Scripts\python.exe -m ruff check src/photo2sim/simulation/so101.py tests/test_so101.py
& .\.venv-sim\Scripts\python.exe -m ruff format --check src/photo2sim/simulation/so101.py tests/test_so101.py
```

## Physical measurements / modifications (unknown unless operator confirms)

Yash was asked for existing measurements/photos; none supplied at publication.
Base mounting/clamp type and dimensions: unknown. Table height/surface plane:
unknown. Base-to-object displacement: unknown. Gripper/pad changes: unknown.
Wrist USB camera is operator-confirmed from earlier capture, historical index 1
(DirectShow; index can change). Exact camera model, bracket dimensions, optical
extrinsics and whether it matches the model wrist camera are unknown.
No estimates are promoted to measurements. No fresh images or motion requested.

Next: operator-led reference-pose photographs with timestamped joint observations,
confirmation of calibration procedure, mounting measurements and camera/gripper
revision. Establish per-joint zero/sign and gripper mapping before real-versus-sim
replay. Never send simulated zero to hardware to obtain this evidence.

Verification: tests/test_so101.py — 8 passed (0.44 s); scoped Ruff lint and format checks passed. Git diff whitespace check passed.
