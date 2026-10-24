"""Offline evidence integrity must not become inferred hardware calibration."""

import hashlib
import json
from pathlib import Path

import pytest


def capture(tmp_path):
    calibration = b'{"joint": {"id": 1}}'
    (tmp_path / "calibration.json").write_bytes(calibration)
    metadata = {
        "calibration_sha256": hashlib.sha256(calibration).hexdigest(),
        "hardware_calibration": json.loads(calibration),
        "samples": 2,
        "units": {"joint.pos": "degrees", "jaw.pos": "normalized_0_100"},
    }
    (tmp_path / "capture.json").write_text(json.dumps(metadata))
    rows = [
        {
            "elapsed_s": float(i),
            "read_started_utc": f"2026-10-24T11:43:0{i}+00:00",
            "read_finished_utc": f"2026-10-24T11:43:0{i}.001+00:00",
            "observation": {"joint.pos": 20 + i * 0.2, "jaw.pos": 5.0},
        }
        for i in range(2)
    ]
    (tmp_path / "observations.jsonl").write_text("\n".join(map(json.dumps, rows)))
    return metadata, rows


def test_valid_capture_leaves_mapping_and_pairing_unknown(tmp_path):
    from photo2sim.simulation.pose_review import audit_capture

    capture(tmp_path)
    report = audit_capture(tmp_path)
    assert report["capture_integrity_passed"]
    assert not report["hardware_mapping_verified"]
    assert not report["physical_pose_pairing_verified"]
    assert report["signals"]["joint.pos"]["span"] == pytest.approx(0.2)
    assert report["mapping_review"]["joint.pos"]["sign"] is None
    assert report["mapping_review"]["joint.pos"]["offset_rad"] is None
    assert report["mapping_review"]["jaw.pos"]["radians_per_unit"] is None


@pytest.mark.parametrize(
    "bad",
    [
        "hash",
        "eeprom",
        "count",
        "error",
        "units",
        "nan",
        "missing",
        "time",
        "clock",
        "reversed_read",
    ],
)
def test_rejects_incomplete_or_inconsistent_capture(tmp_path, bad):
    from photo2sim.simulation.pose_review import audit_capture

    meta, rows = capture(tmp_path)
    if bad == "hash":
        meta["calibration_sha256"] = "0" * 64
    elif bad == "eeprom":
        meta["hardware_calibration"] = {}
    elif bad == "count":
        meta["samples"] = 3
    elif bad == "error":
        meta["error"] = "partial capture"
    elif bad == "units":
        meta["units"]["joint.pos"] = "unknown"
    elif bad == "nan":
        rows[0]["observation"]["joint.pos"] = float("nan")
    elif bad == "missing":
        del rows[0]["observation"]["jaw.pos"]
    elif bad == "time":
        rows[1]["elapsed_s"] = 0
    elif bad == "clock":
        rows[1]["read_started_utc"] = rows[0]["read_started_utc"]
    elif bad == "reversed_read":
        rows[0]["read_finished_utc"] = "2026-10-24T11:42:00+00:00"
    (tmp_path / "capture.json").write_text(json.dumps(meta))
    (tmp_path / "observations.jsonl").write_text("\n".join(map(json.dumps, rows)))
    with pytest.raises(ValueError):
        audit_capture(tmp_path)


def test_real_take2_is_audited_without_hardware():
    from photo2sim.simulation.pose_review import audit_capture

    root = Path(__file__).resolve().parents[1]
    report = audit_capture(root / "examples/so101/windows/reference-20261024-take2")
    assert report["samples"] == 599
    assert report["signals"]["shoulder_pan.pos"]["span"] == pytest.approx(0.2637362637)
    assert report["signals"]["gripper.pos"]["declared_unit"] == "normalized_0_100"
    assert not report["physical_pose_pairing_verified"]


def test_units_are_declared_not_verified_by_an_allowlist(tmp_path):
    from photo2sim.simulation.pose_review import audit_capture

    meta, _ = capture(tmp_path)
    meta["units"]["jaw.pos"] = "radians"
    (tmp_path / "capture.json").write_text(json.dumps(meta))
    report = audit_capture(tmp_path)
    assert report["units_verified"] is False
    assert report["signals"]["jaw.pos"]["declared_unit"] == "radians"
