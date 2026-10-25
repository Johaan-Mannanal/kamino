# Instructions for Srijan's AI agent

> Historical handoff. Current scope and responsibilities are in [PROJECT.md](../PROJECT.md);
> current Windows work is in [yash-articulated-demo.md](yash-articulated-demo.md).
> Preserve this note as context, not a new task assignment.

You own geometry preparation for **Kamino**, a Cal Hacks project turning object photos into editable MuJoCo assets. You are working alongside three other agents; preserve their work and stay in your scope.

## Get the code

If you do not have a clone:

```bash
git clone https://github.com/Johaan-Mannanal/photo2sim.git
cd photo2sim
```

For an existing clone, first inspect `git status --short`; preserve uncommitted work. Update the remote and fetch:

```bash
git remote set-url origin https://github.com/Johaan-Mannanal/photo2sim.git
git fetch origin
git switch -c codex/asset-preparation origin/codex/backend-pipeline
```

If that branch exists, inspect/reuse it; do not reset it. If the current checkout is dirty, leave it intact and use a separate worktree. Base your work on **origin/codex/backend-pipeline**, which carries our shared contracts; main may not contain them yet.

Read README.md, docs/PROJECT.md, and **docs/API.md** before implementing.

## Setup

Use Python 3.12 in `.venv-sim`. macOS/Linux:

```bash
python3.12 -m venv .venv-sim
source .venv-sim/bin/activate
python -m pip install -e '.[dev,simulation]'
```

On Windows use `py -3.12 -m venv .venv-sim` and `.\.venv-sim\Scripts\python.exe -m pip install -e ".[dev,simulation]"`.

## Your deliverable

Own `src/photo2sim/assets/`, `tests/test_assets*.py`, small fixtures under `examples/assets/`, and your team handoff note. Later you may add Gemini property assistance in `src/photo2sim/integrations/gemini.py` with its own tests.

Implement **`prepare_asset(mesh_path: Path, output_dir: Path, properties: AssetProperties) -> AssetRecord`** in `src/photo2sim/assets/prepare.py`, importing the existing shared models. Follow docs/API.md exactly.

1. Begin with a synthetic OBJ/GLB fixture; do not wait for Meshy.
2. Load geometry with trimesh, preserve source files, centre the bounding box at the origin, and apply confirmed full dimensions in metres. Document orientation assumptions and any nonuniform distortion. Handle GLB scene transforms correctly; reject unsupported/broken/empty/degenerate input with useful errors.
3. Export a self-contained visual mesh in metres into the output bundle. Begin with a centred box collision proxy using full property dimensions. Return bundle-relative paths and preserve all property provenance. Do not guess missing scale or mass.
4. Verify resulting extents, centring, input preservation, invalid geometry handling, and portability after copying the bundle. Keep fixtures small and identify them as synthetic.
5. Once deterministic preparation works, add optional Gemini suggestions/questions. AI suggestions stay estimated; API keys stay local. Do not let missing credits block the geometry deliverable.

Backend/orchestration is Johaan's part; MuJoCo export is Yash's; frontend/Fetch is Atul's. Do not modify shared contracts, root dependencies, or their modules without coordination. Report needed dependency/interface changes.

Run your tests plus the existing suite and lint/format checks. Commit and push your feature branch; do not merge main or other branches automatically.

Finish with **“Send to the other computer”**: branch, full SHA, push status, versions, changed files, exact commands, actual results, sample AssetRecord, limitations/blockers, and next integration step. Push needed small fixtures; local paths alone do not transfer files.
