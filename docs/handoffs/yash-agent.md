# Next task for Yash's Windows agent: reusable simulation export

The Windows baseline is accepted as reported evidence for synthetic fixtures. Continue from **`codex/windows-simulation-setup`**, commit `33393ab12c78c7445aeab0e8c98321bd9e5cb9d0`; this includes the earlier bootstrap work. Preserve the fixtures, reports, camera work, and isolated LeRobot environment. You are not alone in the repo; do not overwrite other agents' modules.

## Bring in the shared interface

In your clean simulation worktree:

```powershell
git status --short
git fetch origin
git switch codex/windows-simulation-setup
git merge origin/codex/backend-pipeline
```

Inspect local changes before switching/merging; preserve them. The merge is authorized for this feature branch only, not main. Resolve straightforward placeholder/documentation conflicts by retaining your simulation work and the backend's current shared contracts; report conflicts that change an interface. Do not reset either branch. Use the actual filename `tools/simulation/view.py` without the pasted escaping.

Read `docs/API.md` and `src/photo2sim/contracts.py`. **The shared asset record already exists**; do not invent another schema. Install the merged project's `.[dev,simulation]` into `.venv-sim` and verify imports/dependencies. Keep Windows version snapshots scoped to your environment.

## Own this deliverable

Implement in `src/photo2sim/simulation/export.py`:

```python
def export_asset(asset: AssetRecord, asset_dir: Path, output_dir: Path) -> Path: ...
```

Import `AssetRecord` from `photo2sim.contracts`. Srijan owns mesh loading/preparation, orientation, scaling, centring, and collision-proxy construction. Johaan owns API/orchestration/Meshy. You own prepared asset → MuJoCo bundle and simulation checks.

1. Start with `collision.kind="box"` and a prepared synthetic mesh; do not wait for Meshy or Srijan. Use at least three dimension/mass combinations, including a non-cube cuboid. Fixture properties must be labeled as assumptions/estimates and `synthetic=true`.
2. Prepared meshes are centred, oriented, and already in **metres**. Dimensions are **full extents**; MuJoCo box size uses half extents. Do not apply the old mm→m scale to these new inputs. Keep the original mm-based fixtures unchanged.
3. Build a portable output with `scene.xml`, copied/referenced local meshes, shared asset metadata, and explicit simulation assumptions. Return `scene.xml`. Preserve mass, provenance, and synthetic labels. Use relative paths confined to the bundle. Preserve source assets and handle missing/invalid paths before publishing a usable export.
4. Use explicit valid mass/inertia without double-counting visual and collision geometry. For the first box implementation, label analytic uniform-cuboid inertia as an approximation. Missing friction requires a documented simulation default, not an invented measurement. Reject unsupported collision kinds clearly until implemented.
5. Add a reusable validator for the exported scenes; the current `tools/simulation/validate.py` requires fixture-specific metadata and cannot establish arbitrary asset validity unchanged. Verify loading, scale, finite states, actual contact, settling, and relocation. Record thresholds, timestep, and measured wall-clock duration separately from simulated duration. Do not silently copy fixture-specific tuning or change thresholds to force a pass.
6. Inspect at least one exported scene in the native viewer and report that evidence separately from headless checks. A simulation pass does not establish real-world physical accuracy.

Run the existing suite plus your focused export/validation tests, lint, formatting, and pip check. Commit/push your Windows feature branch; do not merge main or create cloud resources. No motor commands or paid reconstruction jobs are needed.

Finish with **“Send to the other computer”**: full commit SHA, branch/push status, exact commands, callable signature, sample AssetRecord/bundle, tests, headless versus viewer results, timesteps and wall-clock runtimes, known limitations, and next integration action. Push code and small fixtures/reports; local zip paths alone do not transfer files.
