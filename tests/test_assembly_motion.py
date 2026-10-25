"""Actions drive simulator actuators; recorded states are simulated observations."""

import json

import pytest
from test_assembly_export import prepared as prepared_fixture

prepared = prepared_fixture


def scene_for(prepared, tmp_path):
    from photo2sim.assemblies.export import export_assembly

    a, source = prepared
    return export_assembly(a, source, tmp_path / "bundle")


def test_actual_motion_trace_and_deterministic_restart(prepared, tmp_path):
    from photo2sim.assemblies.motion import run_motion

    scene = scene_for(prepared, tmp_path)
    phases = [{"duration_s": 2, "targets_rad": {"hinge": v}} for v in [0.4, -0.4, 0]]
    first = run_motion(scene, phases, tmp_path / "run1")
    second = run_motion(scene, phases, tmp_path / "run2")
    assert first["passed"] and second["passed"]
    trace = json.loads((tmp_path / "run1/trace.json").read_text())
    other = json.loads((tmp_path / "run2/trace.json").read_text())
    assert trace == other
    assert trace[0]["observed_rad"]["hinge"] == 0
    assert trace[0]["targets_rad"]["hinge"] == 0.4
    assert first["phases"][0]["observed_rad"]["hinge"] == pytest.approx(0.4, abs=0.03)
    assert first["phases"][1]["observed_rad"]["hinge"] == pytest.approx(-0.4, abs=0.03)
    assert first["physical_accuracy_verified"] is False
    assert first["warning_count"] == 0
    with pytest.raises(FileExistsError):
        run_motion(scene, phases, tmp_path / "run1")


@pytest.mark.parametrize(
    "phase",
    [
        {"duration_s": -1, "targets_rad": {"hinge": 0}},
        {"duration_s": 1000, "targets_rad": {"hinge": 0}},
        {"duration_s": 1, "targets_rad": {"hinge": 2}},
        {"duration_s": 1, "targets_rad": {"hinge": float("nan")}},
        {"duration_s": 1, "targets_rad": {}},
        {"duration_s": 1, "targets_rad": {"wrong": 0}},
    ],
)
def test_invalid_action_is_not_clipped_or_started(prepared, tmp_path, phase):
    from photo2sim.assemblies.motion import run_motion

    scene = scene_for(prepared, tmp_path)
    out = tmp_path / "invalid"
    with pytest.raises(ValueError):
        run_motion(scene, [phase], out)
    assert not out.exists()


def test_missed_target_is_a_failure_with_retained_trace(prepared, tmp_path):
    from photo2sim.assemblies.motion import run_motion

    scene = scene_for(prepared, tmp_path)
    report = run_motion(
        scene, [{"duration_s": 0.001, "targets_rad": {"hinge": 0.7}}], tmp_path / "too-fast"
    )
    assert not report["passed"]
    assert (tmp_path / "too-fast/trace.json").exists()
    assert not report["physical_accuracy_verified"]


def test_dangling_output_symlink_is_preserved(prepared, tmp_path):
    from photo2sim.assemblies.motion import run_motion

    scene = scene_for(prepared, tmp_path)
    out = tmp_path / "link"
    try:
        out.symlink_to(tmp_path / "absent", target_is_directory=True)
    except OSError:
        pytest.skip("Symlink privileges unavailable")
    with pytest.raises(FileExistsError):
        run_motion(scene, [{"duration_s": 1, "targets_rad": {"hinge": 0}}], out)
    assert out.is_symlink() and not (tmp_path / "absent").exists()


def test_render_failure_retains_failed_report(prepared, tmp_path, monkeypatch):
    from photo2sim.assemblies import motion

    scene = scene_for(prepared, tmp_path)

    def unavailable(*args, **kwargs):
        raise RuntimeError("Graphics unavailable")

    monkeypatch.setattr(motion.mujoco, "Renderer", unavailable)
    out = tmp_path / "graphics-failure"
    with pytest.raises(RuntimeError, match="Graphics unavailable"):
        motion.run_motion(scene, [{"duration_s": 1, "targets_rad": {"hinge": 0}}], out, render=True)
    report = json.loads((out / "report.json").read_text())
    assert not report["passed"] and report["replay"] is None
    assert (out / "trace.json").exists()
