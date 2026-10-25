"""Offline stationary-capture audit and mapping worksheet; never connects to hardware."""

import argparse
import hashlib
import json
import math
import statistics
from datetime import datetime
from pathlib import Path

UNITS = {"degrees", "radians", "normalized_0_100", "normalized_-100_100"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def finite(value):
    require(type(value) in (int, float) and math.isfinite(value), "Expected finite number")
    return float(value)


def timestamp(value):
    date = datetime.fromisoformat(value)
    require(date.utcoffset() is not None, "Timestamp must include timezone")
    return date.timestamp()


def audit_capture(directory: Path) -> dict:
    """Audit saved bytes only; small encoder variation does not establish pose pairing."""
    directory = Path(directory)
    names = ("capture.json", "calibration.json", "observations.jsonl")
    files = {name: (directory / name).read_bytes() for name in names}
    hashes = {name: hashlib.sha256(raw).hexdigest() for name, raw in files.items()}
    meta = json.loads(files["capture.json"])
    calibration = json.loads(files["calibration.json"])
    require(not meta.get("error"), "Capture reports an error")
    require(
        hashes["calibration.json"] == meta.get("calibration_sha256"), "Calibration hash mismatch"
    )
    require(meta.get("hardware_calibration") == calibration, "Recorded EEPROM calibration mismatch")
    units = meta.get("units")
    require(isinstance(units, dict) and bool(units), "Named signal units required")
    require(all(isinstance(k, str) and u in UNITS for k, u in units.items()), "Unsupported units")
    rows = [json.loads(line) for line in files["observations.jsonl"].splitlines() if line.strip()]
    require(
        type(meta.get("samples")) is int and len(rows) == meta["samples"] and len(rows) >= 2,
        "Sample count mismatch or fewer than two samples",
    )
    values = {key: [] for key in units}
    elapsed = []
    starts = []
    finishes = []
    for row in rows:
        observation = row["observation"]
        require(set(observation) == set(units), "Observation keys disagree with units")
        elapsed.append(finite(row["elapsed_s"]))
        starts.append(timestamp(row["read_started_utc"]))
        finishes.append(timestamp(row["read_finished_utc"]))
        require(elapsed[-1] >= 0 and finishes[-1] >= starts[-1], "Invalid read interval")
        for key in units:
            values[key].append(finite(observation[key]))
    require(all(b > a for a, b in zip(elapsed, elapsed[1:])), "Nonmonotonic sample clock")
    require(all(b > a for a, b in zip(starts, starts[1:])), "Nonmonotonic wall clock")
    require(all(a <= b for a, b in zip(finishes, starts[1:])), "Overlapping read intervals")
    signals = {
        key: {
            "declared_unit": units[key],
            "minimum": min(v),
            "maximum": max(v),
            "span": max(v) - min(v),
            "median": statistics.median(v),
        }
        for key, v in values.items()
    }
    review = {
        key: {
            "declared_source_unit": unit,
            "simulation_joint": None,
            "sign": None,
            "offset_rad": None,
            "radians_per_unit": None,
            "status": "unreviewed",
            "evidence": [],
        }
        for key, unit in units.items()
    }
    return {
        "schema_version": "stationary-audit-1.0",
        "scope": "Saved capture integrity and signal ranges only; not physical calibration",
        "capture_integrity_passed": True,
        "units_verified": False,
        "hardware_mapping_verified": False,
        "physical_pose_pairing_verified": False,
        "operator_stationarity_verified": False,
        "source_hashes": hashes,
        "samples": len(rows),
        "first_read_utc": rows[0]["read_started_utc"],
        "last_read_utc": rows[-1]["read_finished_utc"],
        "elapsed_span_s": elapsed[-1] - elapsed[0],
        "sample_rate_hz": (len(rows) - 1) / (elapsed[-1] - elapsed[0]),
        "signals": signals,
        "mapping_review": review,
        "mapping_equation": "q_rad = sign * radians_per_unit * observation + offset_rad",
        "missing_evidence": [
            "Associated whole-arm front/side photographs and operator unchanged-pose confirmation",
            "Multiple distinct associated poses to resolve joint signs and offsets",
            "Measured jaw opening and reviewed gripper conversion",
            "Measured base/table placement before world-frame comparison",
        ],
        "limitations": [
            "Calibration agreement checks recorded metadata against saved bytes; hardware was not contacted.",
            "Units are declarations from capture metadata, not independently verified by this generic audit.",
            "Encoder stability alone does not establish stationary camera association or joint mapping.",
            "No normalized signal is treated as an angle; mapping fields intentionally remain unset.",
            "No requested or sent actions are inferred from observations.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture_dir", type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    report = audit_capture(args.capture_dir)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with args.report.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2, allow_nan=False)
        stream.write("\n")
    print(
        json.dumps(
            {
                "capture_integrity_passed": True,
                "units_verified": False,
                "hardware_mapping_verified": False,
                "samples": report["samples"],
                "report": str(args.report),
            }
        )
    )


if __name__ == "__main__":
    main()
