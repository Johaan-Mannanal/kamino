# Yash: actual SO101 API export ready

Continue the stationary photo pairing and hardware joint-mapping work first.
This additional check is simulation-only; no new motor command, recalibration,
Meshy job or repeated charger test is requested.

Fetch and merge the pushed `origin/codex/backend-pipeline` into your clean
Windows branch, preserving existing work. Read:
`examples/assemblies/so101-guided/api-workflow/README.md`.

Johaan ran actual browser source import → all 13 engineering review acknowledgements
→ saved revision 2 → convex export/motion validation → authenticated ZIP download.
The completed job and exact ZIP survived backend restart. Source meshes and
provenance are retained; grouped geometry matches the accepted candidate exactly.

Use the **new API-produced ZIP**, not the old manual candidate:

```powershell
$simPython = '.\.venv-sim\Scripts\python.exe'
& $simPython -m zipfile -e examples/assemblies/so101-guided/api-workflow/simulation.zip outputs/so101-api-windows
& $simPython -m photo2sim.assemblies validate outputs/so101-api-windows/scene.xml --report outputs/so101-api-windows-validation.json
& $simPython tools/assemblies/check_so101_template.py outputs/so101-api-windows/scene.xml --root-z-offset 0.15 --report outputs/so101-api-windows-template.json
& $simPython -m photo2sim.assemblies.motion outputs/so101-api-windows/scene.xml examples/assemblies/so101-guided/collision-revision/demo-actions.json --output-dir outputs/so101-api-windows-motion --render
```

Choose fresh output paths if any already exist. Inspect this extracted scene in
the native MuJoCo viewer; capture appearance and collision evidence separately
from the offscreen replay. Preserve collision settings, dynamics and thresholds.

Mac original/relocated/extracted checks pass: maximum final tracking error
0.0006168732 rad vs 0.03 tolerance; timestep 0.001 s; repeatable reset; zero
warnings. Root height 0.15 m is assumed free-space clearance, not physical mounting.
Convex hulls and adjacent-pair exclusions are explicit approximations.

Return full SHA/runtime, validation/FK reports, native viewer findings and any
mismatch. Separately return progress on paired photos, joint signs/zeros/gripper
conversion and measured mounting. A simulation pass does not establish physical
accuracy. You do not need to rerun the entire browser flow unless useful or a
Windows-specific API/UI issue appears.
