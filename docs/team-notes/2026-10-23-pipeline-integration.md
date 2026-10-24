# Preparation → simulation → results integration

Branch: `codex/backend-pipeline`. Imported Srijan's `dcfa486` and Yash's `6298d6e` via feature-branch merges. Their source branches and `main` are preserved. Srijan's original note predates his eventual push; his exact reported commit was fetched successfully here.

## Implemented

`POST /api/jobs/{id}/process` (empty body, HTTP 202) atomically claims a reconstructed job with saved properties, then runs:

1. `prepare_asset` into a new attempt directory.
2. Preserve the original synthetic label, full dimensions, mass/friction provenance and preparation notes.
3. Create a separate geometry-only OBJ copy for `export_asset`; original reconstruction and textured preparation stay intact.
4. `export_asset` → `validate_export` with original and relocated checks.
5. Persist the report; publish a ZIP and mark completed only after all checks and packaging pass.

Duplicate/running/completed processing requests return 409. Preparation/export/validation/packaging failures retain artifacts and sanitized errors. Retrying a simulation failure creates another attempt and never submits a new reconstruction. Restarted preparation/validation becomes `processing_interrupted`, with explicit retry available. Property saving uses a conditional write so it cannot race a processing claim. Failed simulation properties can be corrected before retrying; failed reconstruction remains blocked. Unexpected validator exceptions persist a sanitized failure report.

The shared job response adds nullable `validation_path` and `bundle_path`. Existing `export_path` points to `scene.xml`. Every top-level path is job-relative; `asset.visual_mesh` is relative to the exported scene's directory. Details: [API contract](../API.md).

## Verification

- Merged baseline: 148 tests passed on this Mac before new integration tests.
- Test-first integration: 8 new tests failed before implementation, then all passed. Two additional failure-recovery regressions were reproduced and fixed test-first. Full suite: 158 passed; one upstream Starlette/httpx deprecation warning.
- Real cached charger API run completed and produced a 4,911,690-byte portable ZIP. No Meshy call or credits used.
- Charger original and relocated checks passed: 3 simulated seconds each, 30,000 steps, 0.4515 mm maximum penetration, zero simulator/Python warnings in the report.
- Runtime: Python 3.13.7, MuJoCo 3.3.7, NumPy 2.5.4, trimesh 5.2.0. MuJoCo 3.17 has no Intel Mac wheel; this local test does not substitute for Windows 3.17 verification.
- Independent code review found no material actionable issues; reviewer independently ran all 10 pipeline tests and focused lint/format/diff checks.
- CI now installs the simulation extra because imported geometry/export tests require those dependencies. Remote CI results must be checked after pushing.

Example: [portable real charger](../../examples/simulation/apple-20w-charger/README.md).

## Atul next

Merge `origin/codex/backend-pipeline` into your clean frontend feature branch. After PATCHing properties, POST `/api/jobs/{id}/process` without a body and poll through `preparing`/`validating`. Show validation/report availability, and a download button only for completed jobs with `bundle_path`.

Build download URLs as `${API_BASE}/api/jobs/${job.id}/files/${job.bundle_path}` (same pattern for `validation_path` and `export_path`). Keep the reconstruction GLB preview using `mesh_path`. Simulation mesh preview uses `dirname(export_path) + '/' + asset.visual_mesh`; do not treat that asset-relative path as job-relative. Stop polling on completion/failure and allow explicit simulation retry on eligible failures. See documented error codes. No browser should receive service credentials.

## Yash next

Merge `origin/codex/backend-pipeline` into your clean simulation branch. Unzip the real charger bundle and run the Windows validator and native viewer using the example README commands. Check shape and axes, inspect collision separately, and capture a short demonstration/reset recording and viewer evidence. Report actual findings and versions to Johaan; synthetic fixture success alone does not establish real charger appearance.

## Still outstanding

Native viewer acceptance, an explicit orientation-editing flow, second real object, frontend end-to-end acceptance, Gemini assistance exposed through the API/UI, Fetch ACP integration, and Vultr deployment. Srijan's optional Gemini adapter is imported and unit tested; no live Gemini suggestion request or automatic property confirmation is claimed.
