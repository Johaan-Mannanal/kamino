# A complete example: hinged panel

This existing example takes two supplied component meshes through reviewed
articulation to a portable MuJoCo scene. **All inputs are synthetic**: no photos,
reconstruction request, measurements or hardware commands are involved. It
demonstrates the assembly/export path; it does not demonstrate photo reconstruction.

## Inputs, review and output

- [Post mesh](../examples/assemblies/hinged-panel/input/post.obj) and
  [panel mesh](../examples/assemblies/hinged-panel/input/panel.obj), in millimetres.
- [Reviewed correction workflow and physical assumptions](../examples/assemblies/hinged-panel/README.md).
- [Portable simulation ZIP](../examples/assemblies/hinged-panel/simulation.zip).
- [SHA-256 checksum](../examples/assemblies/hinged-panel/SHA256SUMS).
- [Original failed report](../examples/assemblies/hinged-panel/evidence/attempt-0001-validation.json),
  [corrected report](../examples/assemblies/hinged-panel/evidence/attempt-0002-validation.json)
  and [download/relocation report](../examples/assemblies/hinged-panel/evidence/download-validation.json).

The post is fixed and the panel rotates around one reviewed hinge. Mass, damping,
friction and drive settings are assumptions. The historical failed attempt used
an insufficient drive gain; correcting it produced a passing attempt without
overwriting the failed evidence.

## Run from a checkout

Install the [tested environment](QUICKSTART.md). From the repository root with
`.venv` active, choose a new output directory:

```sh
python -m zipfile -e examples/assemblies/hinged-panel/simulation.zip outputs/first-example
python -m photo2sim.assemblies validate outputs/first-example/scene.xml --report outputs/first-example-check.json
```

Expected: the command prints **`"passed": true`** and exits with status 0.
The report checks joint motion/tracking, limits, reset, warnings and a relocated
copy. It records the actual runtime. Choose a new report filename on rerun;
the CLI intentionally refuses to replace an existing report.

To inspect the scene in a native window:

```sh
python -m mujoco.viewer --mjcf outputs/first-example/scene.xml
```

On macOS, if MuJoCo requests its dedicated launcher, use
`mjpython -m mujoco.viewer --mjcf outputs/first-example/scene.xml`.
Viewer display is a separate check from the headless command.

## Run just the download

The ZIP does not depend on this repository to load its scene. In a separate
environment with `mujoco==3.3.7`, extract it and open `scene.xml` with MuJoCo's
viewer. The full Kamino install is needed only to rerun Kamino's validation CLI.
All referenced meshes are included and relative to the scene.

## Limits

This is a fixed-root synthetic mechanism with approximate physical inputs.
A pass is not a measured accuracy score, a real-object reconstruction or evidence
of robot transfer. The [SO-101 trajectory-transfer demonstration](ROBOTICS_DEMO.md)
is a separate prototype. Historical reports remain unchanged; fresh verification
belongs in a new report.
