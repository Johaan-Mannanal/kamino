# Synthetic cube — Windows setup baseline

Hand-authored **synthetic** convex cube, not photo reconstruction. Edge length 0.06 m;
assumed mass 0.2 kg; uniform-density diagonal inertia 0.00012 kg*m^2 on every axis.
OBJ vertices use millimetres with explicit XML scale 0.001. MuJoCo uses metres and kilograms.
A non-colliding visual mesh and separate box collision proxy share explicit body inertia.
A ground plane and fixed table are included. Friction/contact parameters are assumptions.

From the repository root after installing `.[dev,simulation]` into `.venv-sim`:

```powershell
& .\.venv-sim\Scripts\python.exe tools/simulation/validate.py --bundle examples/simulation/synthetic-cube --report outputs/simulation/cube-check.json
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene examples/simulation/synthetic-cube/scene.xml
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene examples/simulation/synthetic-cube/scene.xml --collision
```

`primitive.xml` isolates primitive physics; `scene.xml` loads the relative-path mesh under
`meshes/`. Copy this whole folder without editing any asset paths. The validator checks
both scenes and repeats after copying the bundle to a temporary location.
Reports and native viewer evidence are separate. No cameras, provider calls or robot control.
