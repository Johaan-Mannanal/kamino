# Combined SO101 workspace

This is an offline **hold, object drop, and reset** scene. The robot holds a
simulation pose while the accepted charger falls onto a tabletop. It does not
execute a push, replay hardware data, or control the real arm.

## Assumptions and evidence

- Robot: unchanged pinned Menagerie source, copied with license and hashes.
- Tabletop: Z=0 at the model's base mount; 1.0 × 0.8 m, 0.05 m thick.
- Charger center: X=0.30 m, Y=0.10 m; dropped 0.02 m above the table.
- Six robot reset targets: zero radians. This is not a hardware command or a
  confirmed physical reference pose. Joint and actuator limits are both checked.
- Source object: checked-in accepted API ZIP, already prepared with +90° X
  orientation. It is not rotated again. Dimensions 43 × 27 × 58 mm and mass
  59 g remain **estimated**; friction remains unknown in the asset record.
- Contact uses the existing exporter's documented simulation defaults, one box
  collision, and approximate cuboid inertia. Pin contact/insertion is unsupported.
- Combined timestep: 0.0001 s, versus the standalone robot's 0.005 s. Original
  servo gains and force limits are preserved and are not hardware-calibrated.

`workspace-validation-macos.json` records original and relocated checks with
MuJoCo 3.3.7 / NumPy 2.5.4. Each location ran two identical 3-second trials
(30,000 steps per trial): 0.2515 mm peak penetration, 0.00219 mm final bottom
height error, 0.000825 rad maximum hold deviation, no object/robot contacts,
zero warnings, and exactly matching final states after reset. Wall times were
7.53 s original and 7.71 s relocated, including Python validation overhead.
These are numerical checks; this Mac has not rendered the combined native viewer.

## Reproduce on Windows

Use the separate simulation environment from the repository root, after fetching
and merging the backend branch while preserving local work. Choose new output
names if any below already exist. No new reconstruction or service key is needed.

```powershell
Expand-Archive -Path examples/simulation/apple-20w-charger-cleaned/api-acceptance/simulation.zip -DestinationPath outputs/so101/workspace-source
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.workspace build --asset-dir outputs/so101/workspace-source --output-dir outputs/so101/charger-workspace --layout examples/so101/workspace-layout.json
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.workspace validate outputs/so101/charger-workspace/scene.xml --report outputs/so101/workspace-validation-windows.json
& .\.venv-sim\Scripts\python.exe tools/so101/view_workspace.py outputs/so101/charger-workspace/scene.xml
# Close the first viewer, then inspect collision separately:
& .\.venv-sim\Scripts\python.exe tools/so101/view_workspace.py outputs/so101/charger-workspace/scene.xml --collision
```

Click the viewer and press **R** to reset simulation state and controls. Inspect
arm/table arrangement, charger appearance and reset behavior; preserve native
screenshots and actual version/results. Viewing the assumed layout does not
confirm that it matches our physical table. The GUI helper awaits Windows review.

For a portability check, copy the entire `charger-workspace` folder elsewhere and
run validation against that copy's `scene.xml` with a new report filename. Keep all
relative resources. Each individual report declares `portability_checked=false`;
the checked-in evidence combines separate original and relocated runs. The builder
refuses an existing output directory; the validator
refuses an existing report. Originals and API jobs are not changed.

On macOS/Linux, use the same Python module commands in the simulation environment;
extract the trusted example ZIP with `python -m zipfile -e <zip> <new-directory>`.

## Next dependency

Yash's [configuration, calibration and pose inventory](../../docs/handoffs/yash-so101-mapping.md)
remains the priority. After it arrives, establish joint signs/zeros and gripper
mapping, match reference poses, replace assumed placement with measurements,
then choose one short real-versus-simulated action. Observed-position replay
checks kinematics; commanded-action replay requires separate dynamics assessment.
