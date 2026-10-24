# Preparation and simulation integration plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, with test-first checks and a final independent review.

**Goal:** Turn a reconstructed job with confirmed properties into a validated, downloadable MuJoCo bundle.

**Architecture:** Keep property saving separate from an explicit asynchronous processing request. Reuse Srijan's preparation and Yash's exporter/validator in the existing two-thread worker. Publish paths and a ZIP only after validation passes; retain inputs, intermediate files and failure reports.

**Tech Stack:** Existing FastAPI, SQLite, Pydantic, trimesh, NumPy and MuJoCo.

**Spec:** `docs/PROJECT.md` and `docs/API.md` (already agreed pipeline).

## Global constraints

- Work on the established `codex/backend-pipeline` branch; preserve all team branches and local credentials.
- Dimensions are full extents in metres; provenance and the job's synthetic flag survive every stage.
- No additional paid reconstruction is needed: reuse the existing charger GLB.
- Box collisions and uniform-cuboid inertia are approximations; passing validation does not establish physical accuracy.
- Input axes remain explicit assumptions; no automatic upright detection. Preserve original textured preparation, but export a geometry-only simulation copy.
- One server process per database. Claim processing atomically; each retry uses a new attempt directory.

## Review focus

- Duplicate processing requests must not schedule overlapping work for one job.
- Failed validation must never expose a successful bundle; retain its diagnostic report and scene.
- Restarted simulation work must never submit another paid reconstruction task.
- Textured GLB input must reach the geometry-only exporter without external texture dependencies.
- Missing properties, malformed meshes and failure exceptions must leave prior artifacts intact and avoid leaking secrets.

### Task 1: Integrate processing and result artifacts

**Files:** `src/photo2sim/api/{app,store,worker}.py`, new `src/photo2sim/api/pipeline.py`, `src/photo2sim/contracts.py`, new `tests/test_pipeline.py`.

**Interfaces:** Consume `prepare_asset(mesh_path, output_dir, properties) -> AssetRecord`, `export_asset(asset, asset_dir, output_dir) -> Path`, `validate_export(scene) -> dict`. Produce `POST /api/jobs/{id}/process` (202), `JobRecord.validation_path`, and `JobRecord.bundle_path` alongside existing `export_path`.

- [x] Write/run failing HTTP integration tests: completed mock download and ZIP relocation; no missing-properties processing; duplicate claim returns 409; textured input; failed validation/report retention; restart interruption without provider submission; retry preserves prior attempts; preparation exceptions sanitized.
- [x] Implement atomic store transitions and worker stage dispatch. Keep source/reconstruction files immutable; save preparation, geometry-only copy, scene, report and ZIP per attempt.
- [x] Run the full suite and resolve genuine integration failures.

### Task 2: Verify and hand off

**Files:** `.github/workflows/checks.yml`, `README.md`, `docs/API.md`, `docs/PROJECT.md`, new `docs/team-notes/2026-10-23-pipeline-integration.md`, a portable charger example under `examples/simulation/` if its actual run passes.

- [x] Install the simulation extra in CI so merged tests can collect.
- [x] Run the existing real charger through the API from its cached reconstruction. Inspect report, ZIP contents and relocated loading; do not call Meshy again.
- [x] Record commands, actual test evidence, orientation/material/collision limitations and exact frontend/Windows next steps.
- [x] Run full tests, Ruff, dependency and diff checks; obtain an independent code review and fix material findings. Publish the backend feature branch as the final handoff action.

## Execution ledger

- Baseline: 48 backend tests passed before integration; one upstream Starlette warning.
- Imported Srijan `dcfa486` and Yash `6298d6e` into the backend feature branch with local merges.
- Ruling: reuse the established clean backend checkout because this is continuation of the existing integration task, not a separate feature workspace.
- Ruling: preparation's output may retain textures; a separate geometry-only copy feeds the existing exporter, preserving both teammates' APIs.
- Ruling: interrupted preparation/validation is marked failed with preserved artifacts and explicit retry; it is never routed through reconstruction recovery.

- Task 1: complete. Initial 8 integration tests failed (missing endpoint/recovery), then passed; the combined suite passed 156 tests. Added two test-first regressions for property correction after simulation failure and safe reports on unexpected validator exceptions.
- Task 2: cached real charger completed through the HTTP API with original and relocated validation passing, 0.4515 mm peak penetration and a portable 4.9 MB ZIP. Windows viewer acceptance remains pending.
- Final verification: 158 passed; one upstream Starlette/httpx deprecation. Ruff lint/format, pip check and diff checks passed. Independent review found no material actionable issues and independently ran the 10 pipeline tests.
