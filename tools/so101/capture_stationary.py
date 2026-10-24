"""Read stationary SO101 positions without configuring servos or changing torque.

Run with the existing LeRobot interpreter, never the simulation environment.
Close operator serial clients first. Photographs must be associated separately.
"""

import argparse
import dataclasses
import datetime as dt
import hashlib
import importlib.metadata
import json
import subprocess
import time
from pathlib import Path

import lerobot
from lerobot.motors import Motor, MotorCalibration, MotorNormMode, SerialMotorsBus

SOURCE_SHA = "146d8474932c8b566717eb2738ba459337ab71c4"
NAMES = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")


class ReadOnlyBus(SerialMotorsBus):
    def forbidden(self, *args, **kwargs):
        raise RuntimeError("Stationary capture forbids servo writes and torque changes")

    write = sync_write = write_calibration = enable_torque = disable_torque = forbidden

    def disconnect(self, disable_torque=False):
        if disable_torque:
            self.forbidden()
        return super().disconnect(disable_torque=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    parser.add_argument("--calibration", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--seconds", type=float, default=120)
    args = parser.parse_args()
    if not 0 < args.seconds <= 300:
        raise ValueError("Duration must be 0–300 seconds")
    sha = subprocess.check_output(
        ["git", "-C", str(args.source), "rev-parse", "HEAD"], text=True
    ).strip()
    if sha != SOURCE_SHA:
        raise RuntimeError("Reinspect the read-only bus implementation at this source revision")
    if not Path(lerobot.__file__).resolve().is_relative_to(args.source.resolve() / "src"):
        raise RuntimeError("Imported LeRobot does not belong to the inspected source checkout")
    if subprocess.check_output(
        ["git", "-C", str(args.source), "status", "--porcelain"], text=True
    ).strip():
        raise RuntimeError("Reinspect local LeRobot source modifications before capture")
    raw = args.calibration.read_bytes()
    calibration = {k: MotorCalibration(**v) for k, v in json.loads(raw).items()}
    motors = {
        name: Motor(i, "sts3215", MotorNormMode.DEGREES if i < 6 else MotorNormMode.RANGE_0_100)
        for i, name in enumerate(NAMES, 1)
    }
    if set(calibration) != set(motors) or any(calibration[n].id != motors[n].id for n in NAMES):
        raise ValueError("Calibration motor identity mismatch")
    args.output_dir.mkdir(parents=True, exist_ok=False)
    metadata = {
        "source_sha": sha,
        "lerobot_version": importlib.metadata.version("lerobot"),
        "port": args.port,
        "robot_id": args.calibration.stem,
        "calibration_sha256": hashlib.sha256(raw).hexdigest(),
        "use_degrees": True,
        "units": {n + ".pos": "degrees" if n != "gripper" else "normalized_0_100" for n in NAMES},
        "method": "Direct SerialMotorsBus reads; no Robot.connect/configure; no servo writes",
        "photo_synchronization": "unpaired; operator stationary association required",
        "requested_actions": None,
        "actually_sent_actions": None,
        "samples": 0,
    }
    (args.output_dir / "calibration.json").write_bytes(raw)
    bus = ReadOnlyBus(args.port, motors, calibration)
    try:
        bus.connect()
        actual = {k: dataclasses.asdict(v) for k, v in bus.read_calibration().items()}
        metadata["hardware_calibration"] = actual
        if actual != json.loads(raw):
            raise RuntimeError("EEPROM calibration differs; no normalization/correction attempted")
        print(
            "READ-ONLY CAPTURE ACTIVE: keep follower stationary and take front/side photos",
            flush=True,
        )
        start = time.perf_counter()
        with (args.output_dir / "observations.jsonl").open("x") as stream:
            while time.perf_counter() - start < args.seconds:
                before = dt.datetime.now(dt.timezone.utc).isoformat()
                tick = time.perf_counter()
                counts = bus.sync_read("Present_Position", normalize=False, num_retry=2)
                normalized = bus._normalize({motors[n].id: int(v) for n, v in counts.items()})
                sample = {
                    "read_started_utc": before,
                    "read_finished_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
                    "elapsed_s": time.perf_counter() - start,
                    "read_duration_s": time.perf_counter() - tick,
                    "raw_counts": counts,
                    "observation": {n + ".pos": normalized[motors[n].id] for n in NAMES},
                }
                stream.write(json.dumps(sample) + "\n")
                stream.flush()
                metadata["samples"] += 1
                time.sleep(max(0, 0.2 - (time.perf_counter() - tick)))
    except Exception as error:
        metadata["error"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        bus.disconnect(disable_torque=False)
        (args.output_dir / "capture.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"Saved {metadata['samples']} observations", flush=True)


if __name__ == "__main__":
    main()
