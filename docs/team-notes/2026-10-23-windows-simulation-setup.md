# Windows simulation setup â€” Yash

Branch: `codex/windows-simulation-setup`. The final chat handoff contains the full pushed SHA.
This branch is based on `origin/main` (`ad3b04e`) in a separate managed worktree. Only the
simulation implementation was cherry-picked from the earlier bootstrap branch; camera-preview
history is excluded. The original dirty checkout and its uncommitted camera note remain intact.

The standalone installed Python 3.12.10 interpreter was used because the Python launcher was
unavailable in the restricted session. A fresh project-local `.venv-sim` was created, then
`python -m pip install -e ".[dev,simulation]"` was run in that environment. No shared dependency
files, LeRobot source/environment, calibration, datasets or motor settings were changed.

The earlier synthetic cuboid fixture and its native viewer evidence are retained. This branch
also includes the exact requested synthetic cube (60 mm per side, assumed mass 0.2 kg, analytic
inertia 0.00012 kg*m^2 per axis), with separate visual mesh and box collision geometry.
Neither fixture is reconstructed from photos or a claim of measured real-world physics.

## Commands (PowerShell, simulation checkout root)

```powershell
python -c "import sys; assert sys.version_info[:2] == (3, 12)"
python -m venv .venv-sim
& .\.venv-sim\Scripts\python.exe -m pip install -e ".[dev,simulation]"
& .\.venv-sim\Scripts\python.exe -m pip check
& .\.venv-sim\Scripts\python.exe -c "import photo2sim, mujoco, trimesh, numpy; print('Imports OK')"
& .\.venv-sim\Scripts\python.exe -m ruff check .
& .\.venv-sim\Scripts\python.exe -m ruff format --check .
& .\.venv-sim\Scripts\python.exe tools/simulation/validate.py --bundle examples/simulation/synthetic-cube --report outputs/simulation/cube-check.json
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene examples/simulation/synthetic-cube/scene.xml
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene examples/simulation/synthetic-cube/scene.xml --collision
```

Exact installed versions and final check outcomes are recorded with the fixture/report and
`tools/simulation/environment-windows.json`. No API keys or camera tuning are prerequisites.
Next action: integrate scaled, property-confirmed mocked reconstruction output with the exporter;
extend the fixture-specific checker before accepting arbitrary provider-generated geometry.

## Verified outcomes

Editable project imports, `pip check`, Ruff lint and formatting all pass. Installed versions:
Python 3.12.10, photo2sim 0.0.1, MuJoCo 3.17.0, trimesh 5.2.0, NumPy 2.5.4,
pytest 9.1.1, Ruff 0.17.2, FastAPI 0.162.0, Pydantic 2.14.1 and Uvicorn 0.54.0.
The complete distribution list is in `tools/simulation/environment-windows.json`.

Headless cube: primitive and mesh each pass 100,000 steps / 5 simulated seconds, also
following relocation. Contact at 0.2346 s, peak penetration 0.75398 mm, final centre height
0.4299997654 m (expected 0.43 m), maximum final-window generalized speed 0.00047137
(limit 0.001). No MuJoCo or Python warnings. Existing cuboid checks also pass in this environment.

The cube at the old 0.2 ms timestep initially exceeded the settling-speed threshold. A lower
drop/softer-contact trial exceeded the penetration threshold. The final cube retains its
original 0.7 m initial centre and 1 ms contact time constant, with timestep reduced to 0.05 ms;
the checker acceptance limits were unchanged. These are synthetic assumptions, not calibration.

Native cube viewer was inspected in the new environment: blue cube visibly rests on the table.
The loop completed 45 wall seconds / 42.74 simulated seconds with zero warning counters and
closed cleanly. Evidence is `examples/simulation/synthetic-cube/evidence/native-cube-viewer.png`;
viewer telemetry is separate in `viewer-report.json`. Earlier cuboid and collision-view evidence
remain available under `synthetic-box`. No simulation blocker remains. A prior draft-PR attempt
returned an integration permission error; branch push does not depend on PR creation.
