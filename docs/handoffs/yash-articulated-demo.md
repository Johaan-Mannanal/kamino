# Yash: physical reference evidence while articulated conversion is built

## Purpose and completed work
Kamino is reusable conversion middleware. We intend to convert the SO101
itself through a guided assembly workflow, with CAD/measurements as supporting
inputs. The existing Menagerie robot is an imported comparison reference, not
output of our conversion. Johaan is building the generic links/joints format and
synthetic two-link export; this does not need hardware access.

Your reported 74cf11abf86b39e46228fd3ac1eb314a6e07e3ab clears the reference
workspace's Windows load, reset and relocation checks. Do not repeat those or
submit another Meshy reconstruction. Keep your CRLF fix and all evidence.

## Continue independently
1. Fetch origin. Merge origin/codex/backend-pipeline into your clean simulation
   feature branch when the new commit is available. Preserve local work, LeRobot,
   calibration and recordings; do not reset or merge into main.
2. Confirm the actual arm matches the CAD: photos of the whole assembly, camera
   bracket, gripper and base; list modifications. CAD dimensions remain nominal.
3. Prepare a synchronized reference-capture procedure using the existing working
   operator workflow. Capture stationary whole-arm front/side views with named,
   timestamped six-joint observations, units and exact calibration/config identity.
   Wrist-camera views alone are insufficient to see all joints. If separate
   cameras are not synchronized, document how stationary capture was associated;
   do not label it hardware-synchronized.
4. Start with the current stationary pose. Additional distinct poses and a short
   motion must be performed by Yash using the established operator controls;
   the agent must not send model zero/targets or initiate recalibration. If the
   workflow cannot read observations without changing hardware settings, report
   that and coordinate with the operator before connecting.
5. For later motion capture, identify how to log timestamps, observations,
   requested targets and actual sent/clipped targets. Keep unavailable signals
   explicit. A plan for instrumentation is useful before modifying LeRobot.
6. Measure base-reference-to-table placement and the visible reference points
   used; photograph where each distance starts/ends. Record actual jaw opening
   for each stationary pose if practical. A ruler is sufficient for coarse demo
   setup; record units, method and uncertainty. No precise metrology claim.

Do not infer motor dynamics, joint zeros or gripper angles from CAD alone. Existing
first-five-joint degree values and gripper 0–100 normalization still require
physical sign/offset checks. One pose cannot establish every sign and zero.

## When the two-link fixture arrives
Use the separate simulation environment to run the new assembly tests and the
example export/validator commands. Inspect positive/negative hinge motion and
reset in the native viewer, then repeat after relocating the bundle. It is a
synthetic product-path proof, not an SO101 reconstruction. Report differences
between Mac and Windows without relaxing tolerances to get a pass.

Run from the repository root (choose a fresh output name):

```powershell
& .\.venv-sim\Scripts\python.exe -m pytest -q tests/test_assemblies.py tests/test_assembly_export.py
& .\.venv-sim\Scripts\python.exe -m photo2sim.assemblies export examples/assemblies/two-link-hinge/input/assembly.json --output-dir outputs/assemblies/windows-hinge-1
& .\.venv-sim\Scripts\python.exe -m mujoco.viewer --mjcf outputs/assemblies/windows-hinge-1/scene.xml
```

The export command already runs motion and relocation checks and preserves a
validation.json report. In the native viewer's Control panel, use +0.4, -0.4 and
0 rad for drive_hinge; reset and inspect collisions separately. Save screenshots
and report what actually happened. Details: [example README](../../examples/assemblies/two-link-hinge/README.md).

## Return
Push small evidence and a handoff on codex/windows-simulation-setup. Include full
commit, versions, exact commands, images and observation files, provenance,
missing data, and operator actions actually performed. No service credentials or
large raw datasets. Finish with a concise “Send to Johaan's computer” block.
