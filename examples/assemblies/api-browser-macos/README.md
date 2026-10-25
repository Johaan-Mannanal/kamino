# Guided assembly HTTP/browser acceptance — Mac

Atul's assembly job API/workbench at `01a6af5f6b62285217c43e90abffb4f67cc12355`
was integrated into `codex/backend-pipeline`, with the fixes listed below. This is
an actual browser and HTTP acceptance using synthetic geometry and real MuJoCo
processing. No reconstruction provider, cloud resource or hardware was used.

## What ran
1. Start an isolated backend with application-token authentication and an allowed
   frontend origin on a different port; no provider credentials or `.env` loaded.
2. Open `/assembly.html` in the in-app browser, set the local application token,
   choose `input-project.json` and the source folder
   `examples/assemblies/two-link-hinge/input/` (includes `meshes/base.obj` and
   `meshes/arm.obj`). Source filenames/hashes were checked by the real API.
3. Acknowledge both links and the hinge, save revision 2 with cross-origin PUT,
   then run preparation/export/validation using box collision/native pairs.
4. Observe completed, export generated and motion validation passed separately.
   Download Result ZIP through the browser's authenticated fetch.
5. Compare the browser-downloaded bytes with the server's attempt ZIP; exact
   match. Extract to a new temporary directory and run `validate_assembly` with
   its further relocation check. Both passes succeeded, zero warnings, repeated
   resets, maximum tracking error 7.22e-16 rad against the unchanged 0.03 rad limit.
6. Request the ZIP without authentication: HTTP 401. Browser console had no
   warnings/errors during this run.

`acceptance.json` records the job, revision, archive hash/size and results.
`download-validation.json` records the fresh extracted/relocated motion checks.
`completed.png` shows the completed browser state. The ZIP is retained in the
local acceptance job; regenerate using the tracked synthetic fixture. It is not
necessary to commit another duplicate bundle.

Runtime: Python 3.13.7, MuJoCo 3.3.7, NumPy 2.5.4, trimesh 5.2.0; Vite 7.3.7.
This validates the generic synthetic workflow on Mac, not Windows native viewing,
SO101 physical calibration, photo-only articulated reconstruction or real-world
accuracy.

## Integration fixes and verification
- Allow PUT in configured CORS policy; preflight regression failed before fix.
- Snapshot the submitted revision, keep later edits dirty, and block concurrent
  save/process requests. Ignore late responses after switching workspaces.
- Preserve unsaved review data when loading a replacement fails.
- Stage new revisions before publication. If interruption leaves an unpublished
  numbered directory, a retry preserves it under `interrupted-revisions/` and
  proceeds without overwriting published history.
- Preserve pinned SO101 bytes on Windows with subtree `.gitattributes`. An actual
  `core.autocrlf=true` checkout reproduced four mismatched files before the fix;
  all 20 manifest entries matched afterwards. No model bytes/hashes were changed.

Final suite: 308 Python tests passed, 2 optional skips; 42 frontend tests passed;
TypeScript/production build, scoped Ruff and diff checks passed. Existing warnings:
Starlette/httpx deprecation and Vite shared Three.js chunk size. The suite counts
include all imported tests plus integration regressions, not only this example.
