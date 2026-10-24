import copy
import json

import mujoco
import pytest

from photo2sim.assemblies.observation_replay import apply_frame, replay_frames


def fixture():
    project = {"joints": [{"name": "hinge", "kind": "revolute", "limits_rad": [-1, 1]}]}
    model = mujoco.MjModel.from_xml_string(
        '<mujoco><worldbody><body><joint name="hinge" type="hinge" range="-57.29577951308232 57.29577951308232"/><geom type="sphere" size="0.1" mass="1"/></body></worldbody></mujoco>'
    )
    review = {
        "format": "photo2sim-mapping-review-1.0",
        "project_snapshot": json.dumps(project),
        "captures": {
            "format": "photo2sim-captures-1.0",
            "captures": [
                {
                    "id": "synthetic-motion",
                    "samples": 3,
                    "calibration_sha256": "a" * 64,
                    "signals": {
                        "encoder": {"unit": "degrees", "minimum": 0, "maximum": 90, "median": 30}
                    },
                    "observations": [
                        {"time_s": t, "values": {"encoder": v}}
                        for t, v in [(0, 0), (0.2, 30), (1, 90)]
                    ],
                }
            ],
        },
        "mappings": [
            {
                "joint": "hinge",
                "signal": "encoder",
                "unit": "degrees",
                "sign": -1,
                "offset_rad": 0.1,
                "radians_per_unit": 3.141592653589793 / 180,
                "status": "unverified",
            }
        ],
    }
    return model, review, project


def test_replay_uses_recorded_angles_without_dynamics_or_clipping():
    model, review, project = fixture()
    result = replay_frames(model, review, project, "synthetic-motion")
    assert result["physical_accuracy_verified"] is False
    assert result["frames"][1]["angles_rad"]["hinge"] == pytest.approx(0.1 - 3.141592653589793 / 6)
    last = result["frames"][-1]
    assert last["angles_rad"]["hinge"] < -1
    assert any("limit" in issue.lower() for issue in last["issues"])
    data = mujoco.MjData(model)
    apply_frame(model, data, last)
    assert data.qpos[0] == pytest.approx(last["angles_rad"]["hinge"])
    assert data.time == 1
    assert all(data.qvel == 0)


def test_replay_rejects_wrong_project_or_unordered_recording():
    model, review, project = fixture()
    with pytest.raises(ValueError, match="project"):
        replay_frames(model, review, {"joints": []}, "synthetic-motion")
    broken = copy.deepcopy(review)
    broken["captures"]["captures"][0]["observations"][1]["time_s"] = 0
    with pytest.raises(ValueError, match="time"):
        replay_frames(model, broken, project, "synthetic-motion")


def test_normalized_signal_without_conversion_is_not_an_angle():
    model, review, project = fixture()
    review["mappings"][0].update(unit="normalized_0_100", radians_per_unit=None)
    review["captures"]["captures"][0]["signals"]["encoder"]["unit"] = "normalized_0_100"
    frame = replay_frames(model, review, project, "synthetic-motion")["frames"][1]
    assert frame["angles_rad"]["hinge"] is None
    data = mujoco.MjData(model)
    apply_frame(model, data, frame)
    assert data.qpos[0] == 0
    assert any("conversion" in issue.lower() for issue in frame["issues"])


def test_portable_runner_works_after_relocation_without_photo2sim_import(tmp_path):
    import subprocess
    import sys
    from pathlib import Path

    from photo2sim.assemblies import observation_replay

    model, review, project = fixture()
    mujoco.mj_saveLastXML(str(tmp_path / "scene.xml"), model)
    (tmp_path / "mapping-review.json").write_text(json.dumps(review))
    (tmp_path / "reviewed-project.json").write_text(json.dumps(project))
    script = tmp_path / "replay_observations.py"
    script.write_text(Path(observation_replay.__file__).read_text())
    result = subprocess.run(
        [
            sys.executable,
            str(script),
            "--capture",
            "synthetic-motion",
            "--report",
            str(tmp_path / "report.json"),
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads((tmp_path / "report.json").read_text())["dynamics_tested"] is False
