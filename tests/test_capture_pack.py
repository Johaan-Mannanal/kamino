import json
from pathlib import Path

import pytest

from photo2sim.simulation.capture_pack import build_capture_pack

ROOT = Path(__file__).resolve().parents[1]


def test_real_captures_preserve_units_pairing_hashes_and_photos():
    directories = [ROOT / f"examples/so101/windows/reference-20261024-take{n}" for n in (3, 5)]
    pack = build_capture_pack(directories)
    assert pack["format"] == "photo2sim-captures-1.0"
    assert len(pack["captures"]) == 2
    a, b = pack["captures"]
    assert a["calibration_sha256"] == b["calibration_sha256"]
    assert b["signals"]["gripper.pos"]["unit"] == "normalized_0_100"
    assert b["signals"]["shoulder_lift.pos"]["median"] == pytest.approx(-61.2747252747)
    assert b["pairing"]["association"].startswith("operator-confirmed")
    assert b["photos"][0]["data_url"].startswith("data:image/jpeg;base64,")
    assert len(b["photos"][0]["original_sha256"]) == 64
    assert b["samples"] == 599
    assert pack["hardware_mapping_verified"] is False
    json.dumps(pack, allow_nan=False)


def test_duplicate_capture_ids_rejected():
    directory = ROOT / "examples/so101/windows/reference-20261024-take5"
    with pytest.raises(ValueError, match="Duplicate"):
        build_capture_pack([directory, directory])


def test_tampered_photo_rejected(tmp_path):
    import shutil

    source = ROOT / "examples/so101/windows/reference-20261024-take5"
    target = tmp_path / "take5"
    shutil.copytree(source, target)
    (target / "photos/front.png").write_bytes(b"changed")
    with pytest.raises(ValueError, match="integrity"):
        build_capture_pack([target])


def test_pack_preserves_every_timestamped_observation():
    directory = ROOT / "examples/so101/windows/reference-20261024-take5"
    rows = [
        json.loads(line) for line in (directory / "observations.jsonl").read_text().splitlines()
    ]
    capture = build_capture_pack([directory])["captures"][0]
    assert len(capture["observations"]) == len(rows)
    for actual, original in zip(capture["observations"], rows):
        assert actual == {"time_s": original["elapsed_s"], "values": original["observation"]}
