# SO101 simulation and joint mapping bootstrap

The pinned standalone robot loads and runs a two-second zero-target hold on
MuJoCo 3.3.7 on Johaan's Mac. The numerical report is
[model-inspection-macos.json](model-inspection-macos.json). This is model setup,
not a verified real-to-simulation calibration or manipulation demo.

## Model source

Vendored unchanged from [MuJoCo Menagerie robotstudio_so101](https://github.com/google-deepmind/mujoco_menagerie/tree/f3b6013629c7b94f8ee93fd977b161fa8350f9bc/robotstudio_so101),
commit `f3b6013629c7b94f8ee93fd977b161fa8350f9bc`.
The 22 source files total 17,440,242 bytes. The upstream Apache-2.0 license,
README, and per-file SHA-256 manifest are in `third_party/robotstudio_so101/`.
The vendored model geometry, gains, limits, collisions, and timestep are unchanged.
The derived combined workspace below uses a smaller timestep.
Upstream describes this as the **new calibration** variant and requires MuJoCo
3.1.3 or later. Whether our physical arm uses compatible calibration is pending.

From the repository root, in the simulation environment:

```sh
python -m photo2sim.simulation.so101 --report outputs/so101/model-inspection.json
python -m mujoco.viewer --mjcf third_party/robotstudio_so101/scene.xml
```

The report command refuses to overwrite an existing report; choose a new filename
for another run. Both commands are simulation-only and open no serial ports.
The inspector resolves joints/actuators by name, validates their correspondence,
and records qpos/DOF addresses instead of assuming array order.

## Mapping established so far

| LeRobot action/observation key | MuJoCo joint and actuator | Model joint range, degrees (rounded) |
| --- | --- | --- |
| `shoulder_pan.pos` | `shoulder_pan` | -110 to 110 |
| `shoulder_lift.pos` | `shoulder_lift` | -100 to 100 |
| `elbow_flex.pos` | `elbow_flex` | -96.83 to 96.83 |
| `wrist_flex.pos` | `wrist_flex` | -95 to 95 |
| `wrist_roll.pos` | `wrist_roll` | -157.21 to 162.79 |
| `gripper.pos` | `gripper` | -10 to 100 |

The model's qpos and position-control targets are **radians**. Exact joint and
control limits differ slightly through rounding; both are in the report. These
are model limits, not verified limits for Yash's arm. `baseframe` and
`gripperframe` are upstream reference sites; the latter is not yet a measured
tool-contact point for our actual gripper. The included `wrist_cam` is not our
measured camera calibration.

The [LeRobot follower source](https://github.com/huggingface/lerobot/blob/146d8474932c8b566717eb2738ba459337ab71c4/src/lerobot/robots/so_follower/so_follower.py)
at Yash's previously reported commit assigns motor IDs 1–6 in the table's order.
Its [config](https://github.com/huggingface/lerobot/blob/146d8474932c8b566717eb2738ba459337ab71c4/src/lerobot/robots/so_follower/config_so_follower.py)
defaults `use_degrees=True`: the first five joints use degrees, while the gripper
always uses a calibrated 0–100 range. With `use_degrees=False`, those first five
instead use a calibrated -100–100 range. Runtime overrides and the current
Windows source still need confirmation.

The [normalization implementation](https://github.com/huggingface/lerobot/blob/146d8474932c8b566717eb2738ba459337ab71c4/src/lerobot/motors/motors_bus.py)
uses calibration range midpoints for degree zero; normalized modes use calibrated
endpoints and may account for software drive inversion. Consequently:

- A degrees-to-radians conversion alone does not prove sign or zero alignment.
- A gripper value of 50 means half its calibrated range, **not 50 degrees**.
- Do not map 0–100 directly to the model's full joint limit range without pose evidence.
- Record effective units and calibration alongside each trajectory. Do not infer
  them from the dataset's feature name or a numeric sample.

No hardware converter or hardware-control path is implemented in this bootstrap.

## Acceptance still needed

The [nominal CAD comparison](cad-review/README.md) confirms close agreement for
11 major parts, with bounding dimensions within 0.006 mm. Keep the pinned model
geometry. Saved CAD servo placements have small axis tilts; they do not establish
hardware calibration. Camera geometry and physical scene placement remain unverified.

1. Windows source/config/calibration inventory and native model viewer review:
   [Yash instructions](../../docs/handoffs/yash-so101-mapping.md).
2. Match a photographed, timestamped observed arm pose to the model. Check each
   joint's zero/sign and the gripper's opening angle. Gather additional poses
   through the existing operator-controlled workflow if records are insufficient.
3. Replay observed joint positions in simulation to check geometry. This is a
   **kinematic comparison**, not a prediction of robot dynamics.
4. Separately replay recorded commanded targets, with timestamps and the actual
   post-clipping targets, to assess simulated tracking. This requires actuator
   assumptions and must not be presented as measured dynamics without evidence.
5. Replace the combined workspace's assumed base/table/object placement with
   measurements and add one agreed short action. Compare live real and simulated
   outcomes with assumptions visible.

The current charger uses a single collision box and estimated dimensions/mass.
A broad-body push is a possible first action; pin insertion is unsupported.
The combined scene now passes offline hold/drop/reset checks at a 0.1 ms timestep,
with upstream servo gains unchanged. These checks do not establish manipulation
success, calibrated dynamics, or real-world agreement.

## Combined robot, charger and tabletop

[WORKSPACE.md](WORKSPACE.md) contains reproducible build, validation and resettable
viewer commands. The builder preserves the accepted API charger's saved orientation
and estimated properties. The complete output folder can be moved to another
computer; it includes the robot source/license, object mesh and metadata.

On this Mac, original and relocated scenes each passed two three-second trials:
maximum penetration 0.2515 mm, maximum robot hold deviation 0.000825 rad,
zero warnings and exactly repeatable final states after reset. See
[numerical evidence](workspace-validation-macos.json). Native combined-scene
viewer acceptance remains pending on Windows.
