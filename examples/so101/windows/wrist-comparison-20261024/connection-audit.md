# Connection and control-path audit

LeRobot 0.6.2 is imported from the clean local source checkout at
`146d8474932c8b566717eb2738ba459337ab71c4`. Rustypot is 1.13.1;
its installed SBOM identifies serialport 4.9.0. No live serial port was opened.

## Local LeRobot path

`SerialMotorsBus.__init__` resolves definitions and validates motor IDs without
opening a port. `connect()` calls `_open_bus()` at 1,000,000 baud with a
50 ms timeout, then the default handshake reads six model numbers and firmware
major/minor versions. A failed handshake closes the port. It does not call
`Robot.connect`, normal robot configuration, calibration writes, torque control,
mode setters, gains or limit setters. `read_calibration()` reads limits, offsets
and any supported drive mode. The helper checks these against the saved file,
checks existing position mode/torque, and samples current positions/goals.

`disconnect(disable_torque=False)` closes the port without disabling torque.
The helper guard permits only one raw `Goal_Position` write to `wrist_flex`.
Normalized degrees are converted through the inspected installed bus API.
Requested counts, write attempts, acknowledged writes, goal readbacks and
actual positions have separate log fields/events. Failed reads abort without
new targets or rollback; a failed acknowledgment can follow a received target.

## Native and Windows path

The version-matched [Rustypot constructor and close](https://raw.githubusercontent.com/pollen-robotics/rustypot/v1.13.1/src/bus.rs)
open/drop the serial port and construct protocol handlers; no servo register
writes occur in those constructors. [Windows serialport open](https://raw.githubusercontent.com/serialport/serialport-rs/v4.9.0/src/windows/com.rs)
opens an exclusive read/write handle, sets host serial parameters and timeouts,
and applies DTR if configured. These are real host/adapter side effects, distinct
from servo configuration. Closing releases the handle. Adapter electrical
behavior has not been remeasured; a source audit is not a hardware trace or
reproducible-build proof of the installed native binary.

## Offline checks and operator scope

Eleven tests pass with hardware access replaced by a simulated/native transport.
Two exercise the actual LeRobot connect/handshake/disconnect paths and failed
handshake cleanup. The remaining checks cover both directions, bounds, forbidden
writes, stale goals, torque off, drift, target interference, failed tracking,
Ctrl+C and lost acknowledgment. No hardware acceptance or helper execution is
claimed. The helper pins the reviewed source, Rustypot version and calibration
hash. Calibration bounds do not establish collision-free clearance.

The operator instructions explain Ctrl+C: it stops further writes, preserves
torque and the last target, and is not an immediate physical stop. No new helper
run is requested while existing manual-test photographs await pairing.
