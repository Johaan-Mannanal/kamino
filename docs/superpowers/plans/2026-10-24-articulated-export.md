# Articulated Export Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement inline, with test-first verification and a final independent review.

**Goal:** Generate a portable, controllable two-link assembly using a reusable reviewed-input format.
**Architecture:** Separate assembly contracts and MJCF exporter/validator; preserve rigid AssetRecord/API. A CLI consumes a reviewed record and local geometry, writes a fresh bundle and validation report.
**Tech Stack:** Python 3.12+, Pydantic 2, trimesh, NumPy, MuJoCo.
**Spec:** ../specs/2026-10-24-articulated-export-design.md

## Global constraints
Metres/radians; right-handed frames; unit scalar-first quaternions. No automatic
hardware control, service calls, model replacement or destructive cleanup. Work
on the established clean codex/backend-pipeline feature branch. User authorized
execution; no further design confirmation is necessary for this scoped milestone.

## Review focus
Graph cycles/multiple parents; local-frame mistakes; escaped/symlink paths;
nonfinite or degenerate physical data; false success after no actual joint motion.
Each is covered in contracts/export/validation tests below.

## Task 1: Documentation and coordination
- [x] Update README, PROJECT, example taxonomy and Yash handoff. Preserve historical evidence.
- [x] Clearly mark imported reference robot, generated rigid exports and synthetic assembly proof.

## Task 2: Assembly contract
Files: src/photo2sim/assemblies/contracts.py, tests/test_assemblies.py.
Produces AssemblyRecord (links, joints, root pose, provenance).
- [x] Write rejection/round-trip tests for trees, frames, paths, properties and provenance.
- [x] Run tests and observe failure for absent implementation.
- [x] Implement versioned contracts; validate schema and graph without simulation dependencies.
- [x] Run focused tests and lint.

## Task 3: Export and proof
Files: src/photo2sim/assemblies/export.py, validate.py, __main__.py;
examples/assemblies/two-link-hinge/; tests/test_assembly_export.py.
Interfaces: export_assembly(record, asset_dir, output_dir) -> Path;
validate_assembly(scene, check_portability=True) -> dict.
- [x] Test invalid geometry/path containment, no clobber, provenance, FK including
  rotated joint frames, actual joint motion, failure reporting and relocation.
- [x] Run failing tests, then implement atomic export with per-link box proxies
  and documented approximate inertia; fixed root and fixed/revolute tree only.
- [x] Add deterministic target/reset validator and CLI, preserve failure artifacts.
- [x] Execute the synthetic two-link fixture, save record/report and visual evidence.
- [x] Run full existing tests, lint/format, independently review, resolve findings.
- [x] Update progress and prepare reviewed changes and Windows verification handoff for publication.

## Execution record
- Start: 509cce5, clean backend feature branch. No main changes.
- Product decisions and limitations are recorded in the spec; no SO101 constants.

- Contract tests: 28 initial failures for absent implementation, then 28 passed.
- Export tests: 13 initial failures, then 13 passed. CLI: 2 initial failures,
  then passed. Branched assembly and nonstandard-path re-export also pass.
- Extra review: five altered-XML cases incorrectly passed; added compiled-model
  consistency checks and all now fail as intended. Focused suite: 51 passed.
- Synthetic fixture: original/relocated motion, repeatable reset, no warnings;
  offscreen rendered evidence inspected. Native Windows viewer still pending.
- No changes to existing rigid contracts, exporter, API behavior or imported model.
- Independent review reproduced same-bounds replacement mesh false-success;
  test failed first, XML/compiled mesh identity and manifest checks fixed it.
  Final focused suite: 52 passed. Reviewer reported no further actionable findings.
- Final exported fixture revalidated against reviewed record/hashes after fixes.
- Final full suite after all fixes: 259 passed, 1 optional ACP skip; one existing
  Starlette/httpx deprecation warning. Ruff lint and format checks pass (123 files);
  pip check passes. No remaining actionable independent-review findings.
- Packaging: fixture OBJ LF normalization is scoped under examples/assemblies;
  preserve trimesh's generated final blank line so mesh hashes stay unchanged.
