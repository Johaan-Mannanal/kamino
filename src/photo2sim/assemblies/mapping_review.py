"""Validation for browser-authored capture mapping reviews.

The review is evidence and an attestation, not a calibration result.  Keep the
submitted JSON untouched after validation; the job service owns its retention.
"""

import json
import math
import re
from typing import Any

from photo2sim.assemblies.review import ReviewProject, normalize_project_defaults

_HASH = re.compile(r"^[a-f0-9]{64}$")
_UNITS = {"degrees", "radians", "normalized_0_100", "normalized_-100_100"}
_ANGULAR_SCALE = {"degrees": math.pi / 180, "radians": 1.0}


def canonical_json(value: Any) -> str:
    """The sorted JSON binding used by the mapping-review frontend."""
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    )


def _fail(message: str) -> None:
    raise ValueError(message)


def _object(value: Any, message: str) -> dict:
    if not isinstance(value, dict):
        _fail(message)
    return value


def _finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _finite_json(value: Any) -> None:
    if isinstance(value, dict):
        for item in value.values():
            _finite_json(item)
    elif isinstance(value, list):
        for item in value:
            _finite_json(item)
    elif isinstance(value, float) and not math.isfinite(value):
        _fail("Mapping review contains a non-finite number")


def _same_json(left: Any, right: Any) -> bool:
    """JSON comparison that permits 0/0.0 but never treats true as 1."""
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left is right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return left == right
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(
            _same_json(left[key], right[key]) for key in left
        )
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(_same_json(a, b) for a, b in zip(left, right))
    return type(left) is type(right) and left == right


def _project_data(project: ReviewProject) -> dict:
    return normalize_project_defaults(project.model_dump(mode="json"))


def _validate_captures(value: Any) -> list[dict]:
    pack = _object(value, "Invalid capture pack")
    captures = pack.get("captures")
    if pack.get("format") != "photo2sim-captures-1.0" or not isinstance(captures, list):
        _fail("Invalid capture pack")
    if not 1 <= len(captures) <= 20:
        _fail("Choose a capture pack with 1–20 captures")
    ids: set[str] = set()
    for capture in captures:
        capture = _object(capture, "Invalid capture")
        identifier = capture.get("id")
        samples = capture.get("samples")
        if (
            not isinstance(identifier, str)
            or not 0 < len(identifier) < 200
            or identifier in ids
            or not isinstance(samples, int)
            or isinstance(samples, bool)
            or samples < 2
            or not isinstance(capture.get("calibration_sha256"), str)
            or not _HASH.fullmatch(capture["calibration_sha256"])
        ):
            _fail("Invalid or duplicate capture provenance")
        ids.add(identifier)
        hashes = _object(capture.get("source_hashes"), "Source hashes required")
        if not hashes or not all(
            isinstance(v, str) and _HASH.fullmatch(v) for v in hashes.values()
        ):
            _fail("Source hashes required")
        _object(capture.get("pairing"), "Invalid capture signals or pairing")
        signals = _object(capture.get("signals"), "Invalid capture signals or pairing")
        if not 1 <= len(signals) <= 128:
            _fail("Invalid capture signals or pairing")
        for signal in signals.values():
            signal = _object(signal, "Invalid signal units or values")
            numbers = [signal.get(key) for key in ("median", "minimum", "maximum")]
            if (
                signal.get("unit") not in _UNITS
                or not all(_finite(number) for number in numbers)
                or numbers[1] > numbers[0]
                or numbers[0] > numbers[2]
            ):
                _fail("Invalid signal units or values")
        photos = capture.get("photos")
        if not isinstance(photos, list) or len(photos) > 8:
            _fail("Invalid capture photos")
        for photo in photos:
            photo = _object(photo, "Invalid capture photos")
            if (
                not isinstance(photo.get("view"), str)
                or not isinstance(photo.get("original_sha256"), str)
                or not _HASH.fullmatch(photo["original_sha256"])
                or not isinstance(photo.get("data_url"), str)
                or not re.fullmatch(r"data:image/jpeg;base64,[A-Za-z0-9+/=]+", photo["data_url"])
            ):
                _fail("Only embedded JPEG photo previews are accepted")
        observations = capture.get("observations")
        if observations is not None:
            if (
                not isinstance(observations, list)
                or len(observations) != samples
                or not 2 <= len(observations) <= 20000
            ):
                _fail("Observations must match capture samples")
            previous = -1.0
            signal_keys = set(signals)
            for observation in observations:
                observation = _object(observation, "Invalid observation")
                time_s = observation.get("time_s")
                values = _object(observation.get("values"), "Invalid observation values")
                if (
                    not _finite(time_s)
                    or time_s < 0
                    or time_s <= previous
                    or set(values) != signal_keys
                ):
                    _fail("Invalid observation time or signals")
                previous = time_s
                for key, item in values.items():
                    if not _finite(item):
                        _fail("Invalid observation value")
                    summary = signals[key]
                    tolerance = max(
                        1e-9, abs(summary["minimum"]) * 1e-9, abs(summary["maximum"]) * 1e-9
                    )
                    if (
                        item < summary["minimum"] - tolerance
                        or item > summary["maximum"] + tolerance
                    ):
                        _fail("Observation is outside the declared signal range")
    return captures


def _binding(project: dict, captures: list[dict], mapping: dict) -> dict:
    return {
        "project": project,
        "captures": captures,
        "conversion": {
            key: mapping.get(key)
            for key in ("joint", "signal", "unit", "sign", "offset_rad", "radians_per_unit")
        },
        "reviewer": mapping.get("reviewer"),
        "evidence_note": mapping.get("evidence_note"),
        "capture_ids": mapping.get("capture_ids"),
    }


def _js_number(value: int | float) -> str:
    """Sufficiently mirrors JSON/JS formatting used in the browser issue text."""
    return str(int(value)) if float(value).is_integer() else str(value)


def expected_comparisons(
    project: ReviewProject, captures: list[dict], mappings: list[dict]
) -> list[dict]:
    """Recompute the browser's display-only comparisons before retaining them."""
    joints = {
        joint.name: joint
        for joint in project.joints
        if joint.kind == "revolute" and joint.coupling is None
    }
    calibration_conflict = len({capture["calibration_sha256"] for capture in captures}) != 1
    counts = {
        mapping["signal"]: sum(item["signal"] == mapping["signal"] for item in mappings)
        for mapping in mappings
    }
    result = []
    for capture in captures:
        values = {}
        for mapping in mappings:
            issues = []
            if calibration_conflict:
                issues.append("Different calibration hashes across captures")
            if mapping["signal"] and counts[mapping["signal"]] > 1:
                issues.append("Duplicate source signal mapping")
            signal = capture["signals"].get(mapping["signal"])
            angle = None
            if signal is None:
                issues.append("Missing source signal")
            elif signal["unit"] != mapping["unit"]:
                issues.append("Declared unit mismatch")
            elif mapping["radians_per_unit"] is None:
                issues.append("Explicit conversion required for normalized signal")
            else:
                angle = (
                    mapping["sign"] * mapping["radians_per_unit"] * signal["median"]
                    + mapping["offset_rad"]
                )
                if not math.isfinite(angle):
                    issues.append("Nonfinite conversion")
                    angle = None
                else:
                    ends = [
                        mapping["sign"] * mapping["radians_per_unit"] * signal[key]
                        + mapping["offset_rad"]
                        for key in ("minimum", "maximum")
                    ]
                    limits = joints[mapping["joint"]].limits_rad
                    if any(
                        not math.isfinite(value) or value < limits[0] or value > limits[1]
                        for value in ends
                    ):
                        issues.append(
                            "Joint limit conflict "
                            f"[{_js_number(limits[0])}, {_js_number(limits[1])}] rad; values are not clipped"
                        )
            values[mapping["joint"]] = {"angle_rad": angle, "issues": issues}
        result.append({"capture_id": capture["id"], "joints": values})
    return result


def validate_mapping_review(review: Any, project: ReviewProject) -> None:
    """Match frontend save/load validation without upgrading an attestation."""
    _finite_json(review)
    review = _object(review, "Mapping review must be an object")
    saved_project = _project_data(project)
    snapshot = review.get("project_snapshot")
    if review.get("format") != "photo2sim-mapping-review-1.0" or not isinstance(snapshot, str):
        _fail("Invalid mapping review")
    try:
        snapshot_data = json.loads(snapshot)
        _finite_json(snapshot_data)
        if not _same_json(normalize_project_defaults(snapshot_data), saved_project):
            _fail("Mapping review belongs to a different project revision")
    except json.JSONDecodeError:
        _fail("Mapping review belongs to a different project revision")
    captures = _validate_captures(review.get("captures"))
    mappings = review.get("mappings")
    if not isinstance(mappings, list):
        _fail("Mapping must cover each independent revolute joint once")
    joints = {
        joint.name: joint
        for joint in project.joints
        if joint.kind == "revolute" and joint.coupling is None
    }
    mapping_joints = []
    for mapping in mappings:
        if not isinstance(mapping, dict) or not isinstance(mapping.get("joint"), str):
            _fail("Mapping must cover each independent revolute joint once")
        mapping_joints.append(mapping["joint"])
    if len(mappings) != len(joints) or set(mapping_joints) != set(joints):
        _fail("Mapping must cover each independent revolute joint once")
    calibration_conflict = len({capture["calibration_sha256"] for capture in captures}) != 1
    seen_signals: dict[str, int] = {}
    for mapping in mappings:
        mapping = _object(mapping, "Invalid mapping")
        joint = mapping.get("joint")
        signal = mapping.get("signal")
        unit = mapping.get("unit")
        sign = mapping.get("sign")
        offset = mapping.get("offset_rad")
        scale = mapping.get("radians_per_unit")
        if (
            not isinstance(joint, str)
            or joint not in joints
            or not isinstance(signal, str)
            or not isinstance(unit, str)
            or unit not in _UNITS
            or not isinstance(sign, int)
            or isinstance(sign, bool)
            or sign not in {1, -1}
            or not _finite(offset)
        ):
            _fail("Invalid mapping")
        if scale is not None and (not _finite(scale) or scale <= 0):
            _fail("Conversion must be positive or unset")
        if unit in _ANGULAR_SCALE and scale != _ANGULAR_SCALE[unit]:
            _fail("Angular units use their exact radians conversion")
        if mapping.get("status") not in ("unverified", "user_verified"):
            _fail("Invalid verification status")
        seen_signals[signal] = seen_signals.get(signal, 0) + 1
    for mapping in mappings:
        if mapping["status"] != "user_verified":
            continue
        reviewer, note, ids = (
            mapping.get("reviewer"),
            mapping.get("evidence_note"),
            mapping.get("capture_ids"),
        )
        if (
            not isinstance(reviewer, str)
            or not reviewer.strip()
            or not isinstance(note, str)
            or not note.strip()
        ):
            _fail("Reviewer and evidence note required")
        if (
            not isinstance(ids, list)
            or not all(isinstance(item, str) for item in ids)
            or len(set(ids)) < 2
            or not all(any(c["id"] == item for c in captures) for item in ids)
        ):
            _fail("Cite at least two captures")
        binding = mapping.get("verification_binding")
        if not isinstance(binding, str):
            _fail("Stale verification; review again")
        try:
            binding_data = json.loads(binding)
            _finite_json(binding_data)
        except json.JSONDecodeError:
            _fail("Stale verification; review again")
        if isinstance(binding_data, dict) and "project" in binding_data:
            binding_data["project"] = normalize_project_defaults(binding_data["project"])
        if not _same_json(binding_data, _binding(saved_project, captures, mapping)):
            _fail("Stale verification; review again")
        if calibration_conflict or seen_signals[mapping["signal"]] > 1:
            _fail("Resolve mapping conflicts before verification")
        values = []
        for capture in captures:
            declared = capture["signals"].get(mapping["signal"])
            if (
                not declared
                or declared["unit"] != mapping["unit"]
                or mapping["radians_per_unit"] is None
            ):
                _fail("Resolve mapping conflicts before verification")
            ends = [
                mapping["sign"] * mapping["radians_per_unit"] * declared[key]
                + mapping["offset_rad"]
                for key in ("minimum", "maximum")
            ]
            limits = joints[mapping["joint"]].limits_rad
            if not all(math.isfinite(value) for value in ends) or any(
                value < limits[0] or value > limits[1] for value in ends
            ):
                _fail("Resolve mapping conflicts before verification")
            if capture["id"] in ids:
                values.append(declared["median"])
        if len(set(values)) < 2:
            _fail("Need two distinct source readings to verify a conversion")
    if review.get("physical_accuracy_verified") is not False:
        _fail("Physical accuracy is not verified by a mapping review")
    comparisons = review.get("comparisons")
    if not isinstance(comparisons, list) or not _same_json(
        comparisons, expected_comparisons(project, captures, mappings)
    ):
        _fail("Mapping comparisons do not match the submitted evidence")
