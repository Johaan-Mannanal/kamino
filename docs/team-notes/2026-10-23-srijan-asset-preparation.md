# Asset preparation and optional Gemini suggestions

- Author: Srijan / Codex
- Date: 2026-10-23 (America/Los_Angeles)
- Branch: `codex/asset-preparation`
- Implementation commit: `e0d922d60347465014498400032e288c9fe6906b`
- Push status: not pushed. Automatic approval review rejected publication to
  `https://github.com/Johaan-Mannanal/photo2sim.git` pending explicit user approval.
  After approval: `git push -u origin codex/asset-preparation` (tracking currently
  points to backend-pipeline; do not push to that branch).

## Confirmed / tested

`prepare_asset(Path, Path, AssetProperties) -> AssetRecord` loads OBJ/GLB through
trimesh, bakes scene node transforms, centres the aggregate bounding box, and
scales each axis to the supplied full dimensions in metres. Output is
`meshes/visual.obj`, with local material/texture files as needed. Box collision
uses full property dimensions centred at the origin. Properties and provenance
are passed through unchanged. Inputs are preserved. Unsupported, malformed,
empty, nonfinite, collapsed, and invalid-face inputs produce useful errors.
Failed exports clean up staging. Nonempty output directories are refused.
OBJ uses 17 decimal places to preserve small dimensions.

Gemini is a separate optional adapter with injectable HTTP transport and no new
dependencies. It never runs inside preparation. All suggestions are `estimated`;
invalid/missing values become questions. Missing credentials, quota/credit/HTTP
failures, malformed/blocked/truncated responses become safe `GeminiUnavailable`
errors. Bad local image inputs fail before the request. No live Gemini request
was made, and no credentials were inspected or added.

Changed files:

- `src/photo2sim/assets/__init__.py`
- `src/photo2sim/assets/prepare.py`
- `src/photo2sim/integrations/gemini.py`
- `tests/test_assets_prepare.py`
- `tests/test_gemini.py`
- `examples/assets/README.md`
- `examples/assets/generate_fixtures.py`
- `examples/assets/synthetic_box.obj` / `synthetic_box.glb` (tiny SYNTHETIC boxes)
- This team note.

Environment: Windows, Python 3.12.10, trimesh 5.2.0, numpy 2.5.4,
MuJoCo 3.17.0, pydantic 2.14.1, httpx 0.28.1, pytest 9.1.1, ruff 0.17.2.
These are actual installed versions; the takeover note's MuJoCo version was stale.

Exact validation commands from the repository root:

```powershell
New-Item -ItemType Directory -Force outputs | Out-Null
.\.venv-sim\Scripts\python.exe -m pytest tests/test_assets_prepare.py -q --basetemp=outputs/pytest-assets-final
.\.venv-sim\Scripts\python.exe -m pytest tests/test_gemini.py -q --basetemp=outputs/pytest-gemini-final
.\.venv-sim\Scripts\python.exe -m pytest --ignore=tests/test_api.py -q --basetemp=outputs/pytest-nonapi
.\.venv-sim\Scripts\python.exe -m pytest -q --basetemp=outputs/pytest-full-final
.\.venv-sim\Scripts\python.exe -m ruff check .
.\.venv-sim\Scripts\python.exe -m ruff format --check .
.\.venv-sim\Scripts\python.exe -c "import photo2sim"
.\.venv-sim\Scripts\python.exe examples/assets/generate_fixtures.py
git diff --cached --check
```

Results: geometry 27 passed; Gemini 53 passed; non-API suite 110 passed;
full suite 123 passed, 1 skipped in 3.69s. Skip: OS does not permit symlinks.
One existing Starlette/httpx deprecation warning. Ruff check passed and all 42
Python files satisfy formatting. Package import passed. Fixtures regenerated.
The initial default-temp run failed on sandbox temp access. Sandboxed API tests
stalled in Python's Windows socketpair setup before application execution;
a diagnostic traceback confirmed this. The complete passing run used the same
venv outside the sandbox with the ignored project-local temporary directory.
Headless MuJoCo simulation: not run. Viewer: not run (outside this task's scope).

Geometry coverage includes exact extents/centre, scale/rotation/translation on GLB
nodes, byte-preserved inputs, moved bundles, relocated OBJ textures after removing
source files, export failure cleanup, and subnanometre serialization.

Actual sample record from the synthetic OBJ (caller set synthetic=true):

```json
{
  "schema_version": "1.0",
  "asset_id": "fdfe1d11-df7e-4e38-8aa5-8e21a657ad6e",
  "visual_mesh": "meshes/visual.obj",
  "properties": {
    "dimensions_m": {"x": 0.05, "y": 0.08, "z": 0.12, "source": "measured", "note": null},
    "mass_kg": {"value": 0.3, "source": "user_supplied", "note": null},
    "sliding_friction": null
  },
  "collision": {"kind": "box", "mesh_path": null},
  "synthetic": true,
  "notes": [
    "Orientation: the input mesh axes are assumed to already match the requested x/y/z dimension axes; no rotation or axis permutation was applied.",
    "Bounding box centred at the origin; source centre was (19, -7, 31) in input units.",
    "Scaled per axis independently from source extents (2, 3, 4) (input units, treated as unknown) to confirmed full extents (0.05, 0.08, 0.12) m.",
    "Nonuniform distortion: per-axis scale factors differ by up to 20.0% (x:y:z ratio 1.000:1.067:1.200); the mesh's proportions did not match the confirmed dimensions.",
    "Collision is a box centred at the origin with the confirmed dimensions; mass and friction were passed through unchanged and not inferred from geometry."
  ]
}
```

## Proposed

No shared interface or dependency changes. Keep AI hints separate from confirmed
properties, and let missing credits fall back to manual entry.

## Questions / blockers

Push requires explicit user approval after automatic review rejected publication.
No geometry blocker. Orientation is assumed, not inferred: x/y/z must already
match the confirmed dimensions; native glTF +Y-up is not converted. Nonuniform
scaling can distort geometry. Box collision is an approximation. This does not
repair topology or prove physical realism. Gemini live access/model availability
has not been tested; model can be overridden with GEMINI_MODEL.

## Next action / handoff

Johaan: call `prepare_asset` after confirmed properties, pass a new/empty bundle
directory, and set `asset.synthetic` from `job.synthetic`. Resolve visual_mesh
relative to that asset directory; add the job-relative prefix when serving files.
Catch preparation failures in the backend job flow. GeminiUnavailable should
leave manual confirmation available.

Yash: consume `AssetRecord.visual_mesh` relative to asset_dir and use the supplied
full dimensions for centred box collision. Keep unit scale at 1 because vertices
are already in metres. Run scene loading and headless validation in export work.
Atul: optional Gemini suggestions must remain visibly estimated until confirmation.
