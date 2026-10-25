"""Exported runners work from a relocated directory without Photo2Sim imports."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import mujoco
import pytest
from test_simulation_export import prepared

from photo2sim.assemblies.contracts import AssemblyRecord
from photo2sim.assemblies.export import export_assembly
from photo2sim.simulation.export import export_asset


@pytest.mark.parametrize("kind", ["rigid", "assembly"])
def test_bundle_runs_without_repository(tmp_path, kind):
    if kind == "rigid":
        record, source = prepared(tmp_path)
        scene = export_asset(record, source, tmp_path / "export")
    else:
        source = Path("examples/assemblies/two-link-hinge/input")
        record = AssemblyRecord.model_validate_json((source / "assembly.json").read_text())
        scene = export_assembly(record, source, tmp_path / "export", collision_mode="convex_mesh")
    relocated = tmp_path / "outside-repo"
    shutil.copytree(scene.parent, relocated)
    assert (relocated / "run_simulation.py").is_file()
    assert (relocated / "requirements.txt").read_text() == f"mujoco=={mujoco.__version__}\n"
    environment = json.loads((relocated / "environment.json").read_text())
    assert environment["mujoco"] == mujoco.__version__
    notes = (relocated / "ASSUMPTIONS.md").read_text()
    assert "estimated" in notes
    assert "unknown" in notes.lower()
    assert "Synthetic: True" in notes
    assert "convex" in notes if kind == "assembly" else "box" in notes
    guide = (relocated / "README.md").read_text()
    assert "mjpython" in guide and "--headless" in guide
    assert 'src="kamino.svg"' in guide
    mark = (relocated / "kamino.svg").read_text()
    assert "<svg" in mark and "#75A7F8" in mark
    assert "http" not in mark.replace("http://www.w3.org/2000/svg", "")
    env = {k: v for k, v in os.environ.items() if k not in {"PYTHONPATH", "PYTHONHOME"}}
    result = subprocess.run(
        [
            sys.executable,
            "-I",
            str(relocated / "run_simulation.py"),
            "--headless",
            "--seconds",
            "0.1",
        ],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["finite_state"] is True
    assert report["simulated_time_s"] >= 0.1
    assert report["scope"] == "standalone zero-control smoke check; not full validation"
    assert report["mujoco"] == mujoco.__version__
    invalid = subprocess.run(
        [
            sys.executable,
            "-I",
            str(relocated / "run_simulation.py"),
            "--headless",
            "--seconds",
            "nan",
        ],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert invalid.returncode != 0
