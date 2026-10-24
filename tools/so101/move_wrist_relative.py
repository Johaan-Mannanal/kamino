"""Operator-run relative wrist-flex move. Without --execute, never opens a port.

Only wrist_flex Goal_Position may be written. Ctrl+C stops new targets and
preserves torque and the last target; it is not a physical emergency stop.
"""

import argparse
import dataclasses
import datetime as dt
import hashlib
import importlib.metadata
import json
import math
import subprocess
import time
from pathlib import Path

import lerobot
from lerobot.motors import Motor, MotorCalibration, MotorNormMode, SerialMotorsBus

SOURCE_SHA = "146d8474932c8b566717eb2738ba459337ab71c4"
RUSTYPOT_VERSION = "1.13.1"
CALIBRATION_SHA = "17db9518c585eec7fd5a28a436699c9824355e22816ccb9488d1ee6dc9682237"
NAMES = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")
WRIST = "wrist_flex"


class WristOnlyBus(SerialMotorsBus):
    def forbidden(self, *args, **kwargs):
        raise RuntimeError("Only single-motor wrist_flex Goal_Position writes are allowed")

    sync_write = write_calibration = enable_torque = disable_torque = forbidden

    def write(self, data_name, motor, value, *, normalize=True, num_retry=0):
        if data_name != "Goal_Position" or motor != WRIST or normalize or num_retry:
            self.forbidden()
        if not isinstance(value, int) or not self.allowed_min <= value <= self.allowed_max:
            raise ValueError("Wrist target outside reviewed raw-count interval")
        return super().write(data_name, motor, value, normalize=False, num_retry=0)

    def disconnect(self, disable_torque=False):
        if disable_torque:
            self.forbidden()
        return super().disconnect(disable_torque=False)


def plan_targets(bus, start, delta, speed):
    if not math.isfinite(delta) or not 0 < abs(delta) <= 15:
        raise ValueError("Choose a nonzero change of at most 15 degrees")
    if not math.isfinite(speed) or not 0.5 <= speed <= 2:
        raise ValueError("Speed must be 0.5–2 degrees per second")
    cal = bus.calibration[WRIST]
    # Keep one degree inside both recorded limits; do not clamp a requested move.
    margin = math.ceil((bus.resolution("sts3215") - 1) / 360)
    lower, upper = cal.range_min + margin, cal.range_max - margin
    start_deg = bus._normalize({4: start})[4]
    steps = math.ceil(abs(delta) / (speed * 0.1))
    targets = [bus._unnormalize({4: start_deg + delta * i / steps})[4]
               for i in range(1, steps + 1)]
    if not all(lower <= value <= upper for value in [start, *targets]):
        raise ValueError("Requested move exceeds calibrated wrist limits with 1-degree margin")
    bus.allowed_min = min(start, *targets)
    bus.allowed_max = max(start, *targets)
    return targets


def observe(bus):
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    counts = bus.sync_read("Present_Position", normalize=False, num_retry=0)
    goals = bus.sync_read("Goal_Position", normalize=False, num_retry=0)
    torque = bus.sync_read("Torque_Enable", normalize=False, num_retry=0)
    for values in (counts, goals, torque):
        if set(values) != set(NAMES) or not all(math.isfinite(v) for v in values.values()):
            raise RuntimeError("Incomplete/nonfinite bus reading")
    normal = bus._normalize({bus.motors[n].id: int(v) for n, v in counts.items()})
    return {"read_started_utc": started,
            "read_finished_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "raw_counts": counts, "goal_counts": goals, "torque": torque,
            "observation": {n: normal[bus.motors[n].id] for n in NAMES}}


def check_state(bus, sample, baseline, expected_wrist):
    if any(v != 1 for v in sample["torque"].values()):
        raise RuntimeError("All six servos must already have torque enabled; no torque changes made")
    for name in NAMES:
        cal = bus.calibration[name]
        if not cal.range_min <= sample["raw_counts"][name] <= cal.range_max:
            raise RuntimeError(f"{name} observation outside recorded calibration range")
        if not cal.range_min <= sample["goal_counts"][name] <= cal.range_max:
            raise RuntimeError(f"{name} existing target outside recorded calibration range")
        expected = expected_wrist if name == WRIST else baseline["goal_counts"][name]
        if sample["goal_counts"][name] != expected:
            raise RuntimeError(f"{name} target register changed unexpectedly")
        if name != WRIST and abs(sample["observation"][name] - baseline["observation"][name]) > 2:
            raise RuntimeError(f"{name} drift exceeds 2 units (degrees; gripper normalized 0–100)")
    expected_deg = bus._normalize({4: expected_wrist})[4]
    if abs(sample["observation"][WRIST] - expected_deg) > 3:
        raise RuntimeError("Wrist tracking error exceeds 3 degrees")


def run_motion(bus, delta, speed, emit, sleep=time.sleep):
    first = observe(bus)
    emit("baseline", **first)
    check_state(bus, first, first, first["goal_counts"][WRIST])
    goals_normal = bus._normalize({bus.motors[n].id: int(v) for n, v in first["goal_counts"].items()})
    for name in NAMES:
        if abs(first["observation"][name] - goals_normal[bus.motors[name].id]) > 2:
            raise RuntimeError(f"{name} is not holding within 2 units of its existing goal")
    sleep(0.5)
    baseline = observe(bus)
    emit("preflight", **baseline)
    check_state(bus, baseline, first, first["goal_counts"][WRIST])
    if any(abs(baseline["observation"][n] - first["observation"][n]) > 0.5 for n in NAMES):
        raise RuntimeError("Arm is not stationary; no targets written")
    targets = plan_targets(bus, baseline["raw_counts"][WRIST], delta, speed)
    previous = baseline["goal_counts"][WRIST]
    emit("plan", delta_deg=delta, speed_deg_s=speed, target_counts=targets,
         starting_observation=baseline["observation"])
    for target in targets:
        sample = observe(bus)
        emit("observation", **sample)
        check_state(bus, sample, baseline, previous)
        # Flush intent first. A failed acknowledgment may still mean a write reached the servo.
        emit("write_attempt", motor=WRIST, register="Goal_Position", raw_count=target)
        bus.write("Goal_Position", WRIST, target, normalize=False, num_retry=0)
        emit("write_acknowledged", raw_count=target)
        previous = target
        # No catch-up scheduling: slow communication makes the ramp slower.
        sleep(0.1)
    for _ in range(10):
        sample = observe(bus)
        emit("settling_observation", **sample)
        check_state(bus, sample, baseline, previous)
        sleep(0.1)
    emit("completed", observed_change={n: sample["observation"][n] - baseline["observation"][n]
                                        for n in NAMES})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", default="COM5")
    parser.add_argument("--calibration", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--delta-deg", type=float, required=True)
    parser.add_argument("--speed-deg-s", type=float, default=2)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not args.execute:
        print("OFFLINE ONLY: no serial port opened. Add --execute only for operator-run motion.")
        return
    sha = subprocess.check_output(["git", "-C", str(args.source), "rev-parse", "HEAD"], text=True).strip()
    if sha != SOURCE_SHA or subprocess.check_output(
        ["git", "-C", str(args.source), "status", "--porcelain"], text=True
    ).strip():
        raise RuntimeError("LeRobot source changed; reinspect before hardware access")
    if not Path(lerobot.__file__).resolve().is_relative_to(args.source.resolve() / "src"):
        raise RuntimeError("Imported LeRobot is not the inspected checkout")
    if importlib.metadata.version("rustypot") != RUSTYPOT_VERSION:
        raise RuntimeError("Rustypot version changed; reinspect connection behavior")
    raw = args.calibration.read_bytes()
    if hashlib.sha256(raw).hexdigest() != CALIBRATION_SHA:
        raise RuntimeError("Calibration differs from reviewed follower identity")
    calibration = {n: MotorCalibration(**v) for n, v in json.loads(raw).items()}
    motors = {n: Motor(i, "sts3215", MotorNormMode.DEGREES if i < 6 else MotorNormMode.RANGE_0_100)
              for i, n in enumerate(NAMES, 1)}
    if set(calibration) != set(motors) or any(calibration[n].id != motors[n].id for n in NAMES):
        raise ValueError("Motor identities differ")
    bus = WristOnlyBus(args.port, motors, calibration)
    # Validate numeric arguments and feasible delta offline before opening the serial port.
    midpoint = int((calibration[WRIST].range_min + calibration[WRIST].range_max) / 2)
    plan_targets(bus, midpoint, args.delta_deg, args.speed_deg_s)
    args.output_dir.mkdir(parents=True, exist_ok=False)
    (args.output_dir / "calibration.json").write_bytes(raw)
    with (args.output_dir / "motion.jsonl").open("x", encoding="utf-8") as stream:
        def emit(event, **data):
            stream.write(json.dumps({"utc": dt.datetime.now(dt.timezone.utc).isoformat(),
                                     "event": event, **data}, allow_nan=False) + "\n")
            stream.flush()
        emit("session", source_sha=sha, rustypot_version=RUSTYPOT_VERSION, calibration_sha256=CALIBRATION_SHA,
             port=args.port, delta_deg=args.delta_deg, speed_deg_s=args.speed_deg_s,
             photo_pairing="unpaired; operator confirmation required")
        try:
            bus.connect()
            actual = {n: dataclasses.asdict(v) for n, v in bus.read_calibration().items()}
            if actual != json.loads(raw):
                raise RuntimeError("Hardware calibration differs; no correction attempted")
            modes = bus.sync_read("Operating_Mode", normalize=False)
            if set(modes) != set(NAMES) or any(
                modes[n] != bus._definition(n).operating_modes["position"] for n in NAMES
            ):
                raise RuntimeError("All servos must already be in position mode")
            print("WRIST MOTION ACTIVE. Ctrl+C stops new targets; torque remains enabled.", flush=True)
            run_motion(bus, args.delta_deg, args.speed_deg_s, emit)
            print("Completed. Torque preserved. Take changed-pose photos and stationary capture.")
        except BaseException as error:
            emit("aborted", error=f"{type(error).__name__}: {error}",
                 response="No further targets; last target and torque preserved. No automatic rollback.")
            raise
        finally:
            bus.disconnect(disable_torque=False)


if __name__ == "__main__":
    main()
