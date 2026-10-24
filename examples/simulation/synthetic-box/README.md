# Synthetic convex box — simulator bootstrap

This is a hand-authored **synthetic test fixture**, not a reconstructed object. No photos,
Meshy jobs, real-object property measurements, trained policies, or robot motion are involved.

- `primitive.xml`: primitive-only free-body drop onto a fixed table, plus ground.
- `scene.xml`: the same body with a visual OBJ and a separate box collision proxy.
- `meshes/synthetic_box_mm.obj`: closed convex cuboid, 8 vertices / 12 triangles, in mm.
- `metadata.json`: explicit units, scale, mass, analytic inertia, assumptions, tolerances.
- `validation-report.json`: recorded Windows headless results for original and copied bundles.
- `*-viewer-report.json`: native viewer telemetry, separate from headless validation.
- `evidence/`: three deliberate native-window screenshots, not reconstruction outputs.

The box is 80 x 60 x 40 mm, with an assumed mass of 0.2 kg and uniform density. Inertia is
analytic, centred at the origin. MuJoCo uses metres; the OBJ is scaled by 0.001. Friction and
contact parameters are illustrative assumptions, not calibrated material properties.
The blue mesh is non-colliding (group 2). The orange proxy is collision group 3; our viewer
hides it by default and shows it with `--collision`. Both share the explicit body inertia.

From the repository root after [environment setup](../../../tools/simulation/README.md):

```powershell
& .\.venv-sim\Scripts\python.exe tools/simulation/validate.py --report outputs/simulation/validation.json
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene examples/simulation/synthetic-box/primitive.xml
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene examples/simulation/synthetic-box/scene.xml
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --collision
```

Close the native viewer normally; it releases resources on exit. `--seconds 20` auto-closes
after 20 wall seconds. Screenshots demonstrate visible native rendering; telemetry alone
does not establish that the viewer displayed a useful image.

Copy this whole folder elsewhere without editing XML or metadata. Both scene files find the
mesh relative to their XML location. Then use the native viewer directly:

```powershell
& $simPython -m mujoco.viewer --mjcf "$copiedBundle\scene.xml"
```

Here `$simPython` is the absolute path of your isolated simulation interpreter and `$copiedBundle`
is the copied folder. The fixture validator also accepts `--bundle $copiedBundle`. It automatically
copies the input to another temporary directory and repeats both headless checks.

Recorded result: 5 seconds / 25,000 steps per scene; contact at 0.239 s; peak transient
penetration 0.8305 mm; final centre height 0.4199998566 m (expected 0.42 m); settled;
no simulator/Python warnings. Both copied scenes pass. This is one axis-aligned drop under
synthetic assumptions, not general asset certification or evidence of real-world accuracy.
