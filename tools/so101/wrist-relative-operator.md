# Operator-run wrist-only reference

Current priority: inspect the already completed manual teleop baseline/changed
captures and four existing photos. The helper remains unexecuted. These commands
are retained for operator review and possible future use; another test is not
requested while the existing evidence is awaiting photo pairing.

Prepared after the context handoff on October 24, 2026. No hardware connection
or motion was performed while preparing this helper. Take 5 is historical;
this helper starts from the follower's current measured wrist position.

The operator chooses a direction with visible clearance for the wrist, camera,
wires and surrounding links. Positive means increasing the installed LeRobot
wrist-flex degree observation; its physical direction is not yet established.
Recorded calibration limits alone cannot establish collision clearance.

Close teleoperation and other serial clients first. The follower must already
be stationary and holding with all six torque states enabled. The helper
refuses to enable torque or change servo modes. Do not restart teleoperation
between the new baseline and this relative move.

## PowerShell

Run these commands yourself. The first command is offline and opens no port:

```powershell
Set-Location 'C:\Users\ypira\.codex\worktrees\windows-simulation-setup\calhacks-arm'
$robotPython = 'C:\Users\ypira\lerobot-env\Scripts\python.exe'
$robotSource = 'C:\Users\ypira\lerobot'
$followerCalibration = 'C:\Users\ypira\.cache\huggingface\lerobot\calibration\robots\so_follower\hackathon_follower.json'
$wristRun = Join-Path (Get-Location) ('outputs\so101-wrist-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$wristDelta = 15  # Use -15 instead to decrease the reported wrist-flex angle.

& $robotPython tools\so101\move_wrist_relative.py --port COM5 --source $robotSource --calibration $followerCalibration --output-dir $wristRun --delta-deg $wristDelta
```

This next command executes the move, about 15 degrees at at most 2 degrees per
second in target increments. Communication time makes it slower. The guard
rejects endpoints within one degree of either stored wrist limit; it does not
clamp or reverse a rejected request.

```powershell
& $robotPython tools\so101\move_wrist_relative.py --port COM5 --source $robotSource --calibration $followerCalibration --output-dir $wristRun --delta-deg $wristDelta --speed-deg-s 2 --execute
```

Proceed with the changed-pose capture only if the command reports completion.
Keep the arm and jaw opening unchanged through capture and front/side photos:

```powershell
$changedReference = Join-Path (Get-Location) ('outputs\so101-wrist-changed-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
& $robotPython tools\so101\capture_stationary.py --port COM5 --source $robotSource --calibration $followerCalibration --output-dir $changedReference --seconds 10
```

Record the new baseline folder, motion folder, changed-reference folder, photo
filenames, and whether the arm and jaw opening stayed unchanged. Confirm
mirroring and camera identity separately. Pairing remains operator-confirmed,
not hardware-synchronized. No upload or commit of new hardware evidence is
performed by these commands.

## Behavior and evidence

- Only motor 4 (`wrist_flex`) `Goal_Position` is written. Other goal registers,
  torque, calibration, offsets, gains and limits receive no writes.
- Source identity, calibration file hash, hardware calibration, existing
  position mode and existing torque are checked before motion.
- All joints are observed. The helper rejects an initially moving arm or stale
  goals, unexpected goal changes, other-joint drift over 2 degrees (gripper:
  2 normalized units), or wrist tracking error over 3 degrees. Checks depend on
  serial responses and are not a guaranteed physical stop.
- `motion.jsonl` records UTC read windows, raw positions, normalized observations,
  goal readbacks, torque, write attempts and acknowledged writes. Goal readback
  and acknowledgment remain distinct from actual observed motion. A lost
  acknowledgment can occur after the servo received a target.
- Ctrl+C or an error stops further writes, releases the serial port and keeps
  torque and the last target. The servo can continue toward that target. There
  is no automatic rollback or torque-off command.
- A completed log includes actual changes in all six observations. Other
  joints' targets staying unchanged does not prove their physical poses stayed
  unchanged. This experiment supplies mapping evidence, not a calibration fix.

## Offline verification

```powershell
& $robotPython -B -m unittest discover -s tools\so101 -p test_move_wrist_relative.py -v
```

Tests simulate the bus without opening a serial port. They cover both move
directions, unchanged other targets, limit/argument rejection, prohibited
writes, torque-off and stale-goal rejection, drift, target interference,
tracking failure, interruption, and an unacknowledged write attempt.
