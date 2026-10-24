# Guided assembly entry and diagnostics

User-approved scope: remove hand-authored JSON from the assembly entry workflow,
show readable validation failures, verify another mechanism, update docs/startup.
Implementation stays in FastAPI and the existing TypeScript/Three.js workbench.

1. Add authenticated mesh-only draft import. Explicit metres/millimetres input;
   preserve original bytes and normalize geometry to metres. Generate immutable
   source hashes and one unreviewed base link with clearly estimated starting mass.
   Test unit conversion, raw preservation, invalid/duplicate uploads and auth.
2. Add guided link naming and connected fixed/revolute joint creation/editing.
   Preserve reference geometry; reject duplicate names/cycles and invalidate review.
   Test grouping, rename references, invalid graph and review invalidation.
3. Render retained validation reports with original/relocated check results,
   per-joint tracking errors and links to current review items. Historical reports
   remain labeled with their attempt/revision. Protect async job-switch boundaries.
   Test failed checks, partial/malformed reports, stale loads and joint navigation.
4. Add an explicitly synthetic hinged-panel mechanism with common-frame meshes.
   Exercise mesh-only import, guided revision, real MuJoCo validation, download
   and relocation. Save source inputs, reports and browser evidence.
5. Reconcile README/project status, document mesh coordinates/units/limitations,
   and provide repeatable local demo startup without provider calls. Run relevant
   tests, full suites/build, inspect browser behavior and commit/push evidence.

Boundaries: no automatic joint inference, hidden physical calibration, hardware
commands or provider calls. Whole-scene placement remains distinct from pivot
editing. Mesh-only entry accepts already separated parts; STEP remains optional CLI.

## Completion evidence
- Tasks 1–3: implemented with failing-then-passing focused tests. Backend mesh
  route started at HTTP 405; per-joint telemetry started with a missing-key failure.
  Guided builder, workbench and diagnostics focused tests pass.
- Task 4: live browser mesh-only import, guided grouping/rename/review, weak-drive
  failure, correction, new revision, real motion validation and ZIP download passed.
  Download matches server and passes independent extraction/relocation checks.
  Evidence: `examples/assemblies/hinged-panel/`.
- Task 5: reconciled README/current plan/API/guided docs and added local demo launcher.
- Full verification: 315 Python passed, 2 optional skips; 54 frontend passed;
  production build, Ruff lint/format and diff checks pass. Existing upstream
  Starlette/httpx deprecation and Vite chunk-size warnings remain.
- Final independent read-only review: no material findings.
- Scope remains component-mesh/CAD-assisted assembly conversion. Automatic photo
  articulation, physical calibration and new fixture Windows acceptance are pending.
