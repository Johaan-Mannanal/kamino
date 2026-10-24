# Simulation tools

Standalone Windows-compatible helpers; no robot environment, cameras, motors, or provider API.

From the repository root in PowerShell (existing standalone Python 3.12, not LeRobot):

```powershell
python -c "import sys; assert sys.version_info[:2] == (3, 12); print(sys.version)"
python -m venv .venv-sim
& .\.venv-sim\Scripts\python.exe -m pip install -r tools/simulation/requirements-windows.txt
& .\.venv-sim\Scripts\python.exe -m pip check
& .\.venv-sim\Scripts\python.exe -c "import mujoco,trimesh,numpy; print(mujoco.__version__,trimesh.__version__,numpy.__version__)"
& .\.venv-sim\Scripts\python.exe tools/simulation/validate.py --report outputs/simulation/validation.json
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene examples/simulation/synthetic-box/primitive.xml
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene examples/simulation/synthetic-box/scene.xml
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --collision
```

The Windows snapshot pins the three requested packages and their installed required dependencies.
No Isaac Sim, CUDA tooling, reconstruction models, or application dependencies are installed.
`.venv-sim` is already ignored by the repository's `.venv-*/` rule. `outputs/` is also ignored.
Do not install these into the working LeRobot environment.

`validate.py` is deliberately **fixture-specific**, not a backend interface or arbitrary-asset
validator. It checks mesh closure/convexity, scale, analytic inertia and mass, separated collision,
finite states, fall/contact/settling, penetration and warnings, then copies the bundle and repeats.
Failures produce a JSON report and a nonzero exit. The headless checks require no graphics.

`view.py` uses the [native passive viewer](https://mujoco.readthedocs.io/en/stable/python.html#passive-viewer),
with simulation stepping and display sync. It supports `--scene`, `--collision`, `--seconds`,
and an optional `--report` path. Viewer reports are telemetry, not substitutes for visual inspection.
See the [fixture](../../examples/simulation/synthetic-box/README.md) for units, assumptions and evidence.
