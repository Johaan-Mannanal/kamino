# Windows combined SO101 + charger workspace acceptance — 2026-10-24

## Result

Merged required backend `37ead2038ebfd402c7d910332ac75d0c76060e01` into
`codex/windows-simulation-setup`, preserving the inventory, CAD, fixtures and camera
work. No hardware connection, robot command, calibration, first-demo replay,
Meshy job or standalone charger demo was performed.

Original AND separately relocated combined scenes pass unmodified validation.
Native visual and collision viewers were inspected. R was pressed twice in the
visual viewer; actual helper reset calls restored identical full qpos and controls.
21 requested tests pass. Layout, zero pose and servo dynamics remain assumptions;
this demonstrates simulated hold/drop/reset, not manipulation or physical matching.

## Windows issue and scoped fix

First build FAILED with `Pinned robot source hash mismatch: so101.xml`.
Git core.autocrlf=true had expanded four pinned text files to CRLF. Compared each
to its HEAD blob and SOURCE.json hash, confirmed the only difference was CRLF,
and restored exact pinned bytes. Added `third_party/robotstudio_so101/.gitattributes`
with `* -text` to preserve ALL upstream bytes in future Windows checkouts. No source
hashes or thresholds changed. Robot SOURCE.json files all match their recorded hashes.
The subsequent validate command in that first shell attempt could not find the
unbuilt scene; no report was produced for that failed attempt.

First sandboxed pytest run produced 12 passes / 9 setup errors because its temp
folder was inaccessible. The exact requested command rerun outside that sandbox
passed all 21 tests in 9.00 s. Scoped Ruff lint and format checks passed.

## Versions and timing

Python 3.12.10, checkout `.venv-sim/Scripts/python.exe`; MuJoCo 3.17.0,
NumPy 2.5.4, trimesh 5.2.0, Pydantic 2.14.1, pytest 9.1.1.

Each validation executes two 3-second trials, 30,000 steps per trial at 0.0001 s
(6 simulated seconds per report). Original validation wall time 2.6893702 s;
relocated 2.5212326 s, including model loading/validation overhead, excluding
interpreter startup. Both reports are preserved separately under
`examples/so101/windows/`:

- `workspace-original-20261024.json`
- `workspace-relocated-20261024.json`
- `workspace-windows-summary-20261024.json` (versions, portability, all bundle hashes)

All four trials match: finite state; zero MuJoCo/Python warnings; tabletop contact;
zero object/robot contacts; peak penetration 0.456060 mm (limit 1 mm); final bottom
error -0.001093 mm (absolute limit 0.2 mm); maximum robot hold deviation
0.000824372 rad (limit 0.02 rad); maximum final-window linear speed approximately
1.60e-12 m/s and angular speed 0. Each pair of reset trials has exactly identical
final state. Reports retain their single-directory `portability_checked=false`;
the summary combines the two independent passes and byte-for-byte equality of
all 29 files at both locations to establish portability. No limits were relaxed.

Original generated directory: checkout `outputs/so101/charger-workspace-win-20261024`.
Relocated complete bundle was outside the Git checkout, under the writable
visualizations directory, `so101-workspace-relocated-20261024`. These generated
bundles are not committed; reproduce from the already committed API ZIP and tools.

## Native inspection and reset evidence

Native overview `examples/so101/windows/workspace-native-overview.jpg`:
yellow robot, dark tabletop and blue charger mesh render together. The object
settles on the tabletop while the robot remains in its reset pose. The visual is
uniform blue, not photo-textured. No old surrounding base is present.

`workspace-native-pins-detail.jpg` shows two upward pins in a zoomed view; parts
of the robot and object bottom are cropped in that detail. It complements the full
overview and is not a dimensional acceptance measurement. Lighting is dark and
casts substantial shadows; geometric presence/orientation is visible.

`workspace-native-collision.jpg` is from a separate invocation with --collision:
visual meshes are hidden; simplified robot collisions, tabletop and one orange
object bounding box render. The bounding box includes the object's full estimated
extent; pin-level collision/insertion and detailed surface contact are unsupported.

`workspace-native-resets-20261024.jsonl` preserves raw actual helper-reset telemetry:
one initial reset then two R-triggered resets. Before the two key resets simulation
times were 154.7255 s and 19.3720 s; afterward time=0, all robot qpos/controls=0,
object xyz=[0.3,0.1,0.049], quaternion=[1,0,0,0]. The reset state/control arrays are
identical in all three records. A diagnostic wrapper around reset_workspace logged
without changing its physics or viewer loop. Its optional object_position_m field
is null because the diagnostic looked up `object` while the actual body is `asset`;
the full qpos is authoritative (object xyz indices 6:9). No production helper was changed.

No short native video was captured. Screenshots do not prove the transient drop;
actual key-reset logs and numerical settling checks support those behaviors.
Both viewers closed cleanly. No native crash or visible instability observed.

## Exact reproduction commands

Run from the simulation checkout on Windows with its existing environment. These
paths were fresh for this run; choose new names on any repeat. Do not delete or
overwrite previous outputs/reports. Test command requires a writable temp directory.

```powershell
Expand-Archive -LiteralPath examples/simulation/apple-20w-charger-cleaned/api-acceptance/simulation.zip -DestinationPath outputs/so101/workspace-source-win-20261024
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.workspace build --asset-dir outputs/so101/workspace-source-win-20261024 --output-dir outputs/so101/charger-workspace-win-20261024 --layout examples/so101/workspace-layout.json
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.workspace validate outputs/so101/charger-workspace-win-20261024/scene.xml --report examples/so101/windows/workspace-original-20261024.json
# Choose a fresh destination outside this checkout; copy ALL files:
$relocated = Join-Path $env:TEMP 'photo2sim-so101-workspace-new-copy'
if (Test-Path -LiteralPath $relocated) { throw 'Choose a fresh destination' }
Copy-Item -LiteralPath outputs/so101/charger-workspace-win-20261024 -Destination $relocated -Recurse
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.workspace validate "$relocated\scene.xml" --report examples/so101/windows/workspace-relocated-20261024.json
& .\.venv-sim\Scripts\python.exe tools/so101/view_workspace.py outputs/so101/charger-workspace-win-20261024/scene.xml
# Focus viewport, press R twice, observe each reset/settle, close viewer.
& .\.venv-sim\Scripts\python.exe tools/so101/view_workspace.py outputs/so101/charger-workspace-win-20261024/scene.xml --collision
& .\.venv-sim\Scripts\python.exe -m pytest -q tests/test_so101.py tests/test_so101_workspace.py
& .\.venv-sim\Scripts\python.exe -m ruff check src/photo2sim/simulation/workspace.py tools/so101/view_workspace.py tests/test_so101_workspace.py
& .\.venv-sim\Scripts\python.exe -m ruff format --check src/photo2sim/simulation/workspace.py tools/so101/view_workspace.py tests/test_so101_workspace.py
```

Exact local relocation used for the recorded run (instead of the portable TEMP
example above):
`C:\Users\ypira\.codex\visualizations\2026\10\24\01a16b93-2bdd-7881-b307-3de00db938cb\so101-workspace-relocated-20261024`.

## Limits / next action

Charger 43 x 27 x 58 mm dimensions and 59 g mass remain ESTIMATED, with approximate
cuboid inertia and a SINGLE BOUNDING BOX collision. No new texture, geometry or
reconstruction was produced. Table is assumed 1.0 x 0.8 x 0.05 m, surface Z=0;
object XY=[0.30,0.10] m, initial clearance 0.02 m. Robot reset is six model zero
radians and actuator dynamics are not hardware-calibrated. Standalone robot and
combined scene timesteps differ as documented upstream. Windows and macOS peak
penetration differ (0.456 vs 0.252 mm) but both meet unchanged criteria.

No simulation blocker remains after the pinned-byte checkout fix. Johaan can
integrate this evidence and continue CAD comparison/reference-pose mapping before
any real-versus-sim replay. This acceptance does not approve hardware motion.
