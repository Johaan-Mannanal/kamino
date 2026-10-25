# Kamino checkpoint and rigid target review implementation plan

> Required execution skill: superpowers:executing-plans. Implement inline, with a final independent review.

Goal: publish a clean branded sizing/Gemini checkpoint, then add bounded manual surface-island selection and source-bound geometry review on a separate branch.
Architecture: deterministic source-hash-bound surface inventory and explicit selected island set precede existing orientation/sizing. Immutable attempt inputs retain original source and selection/review provenance.
Tech stack: existing Python/FastAPI/trimesh/NumPy and TypeScript/three frontend; no reconstruction or CAD integration.
Spec: current user assignment and can-real-case-d410-reproduction investigation.

## Constraints

- Preserve old d410 source/evidence and all historical exports, raw inputs and compatibility identifiers.
- No largest-part selection, hidden deletion, forced dimensions, new Meshy requests or CAD work. Multiple islands may represent one target.
- Every newly generated attempt, including legacy-job regeneration, requires current source/selection/orientation-bound target review. Existing historical downloads stay accessible.
- Reference correspondence is invalidated when source, selection or orientation changes.
- Atul owns Figma layout. Correction UI module and workflow hook await ownership acknowledgement; backend work is independent.

## Tasks

- [x] Checkpoint: reconstruct verified d410, apply 25 compatible branding files and five latest master docs; full Python/frontend/lint/build; label exact source; commit/push only isolated branch.
- [x] Inventory/selection: deterministic edge-connected island IDs tied to source hash; selected subsets permit multiple islands; reject empty/unknown/stale sets; no graph-engine dependency or automatic defaults. RED→GREEN tests.
- [x] Review/API/persistence: selected geometry preview, source-bound target review, sizing invalidation, claim-time recheck and immutable attempts; historical download preservation; RED→GREEN API/history tests.
- [x] UI after Atul acknowledgement: dedicated target-review module, explicit visible selection and review, clear unresolved state and re-review; reuse orientation/uniform sizing controls; tests.
- [x] Acceptance: synthetic distractors/legitimate multipart/seam cases, exact original can, source-change/selection/orientation invalidation, concurrency/history, relocation, browser; final independent review; reviewable feature patch, no integration merge.

## Review focus

Unwelded seams must not lose triangles; node instancing transforms preserve geometry; stale source/selection races cannot process old references; failed retries retain input downloads; multipart objects remain possible without automatic deletion.

## Ledger

- Ruling: use a fresh managed worktree to leave the original integration worktree and all d410 evidence untouched. Only reconstructed source and reviewed branding/latest docs enter the checkpoint.
- Ruling: historical exports remain readable, while user explicitly requires new review for every newly generated attempt. This intentionally tightens processing requests, not historical deserialization/downloads.

- Checkpoint complete: `724867cea2497a571002e6d0d9ac46d64b604c6f`, remote branch verified, 378 Python passed / 2 optional skips; 86 frontend passed; build/Ruff passed. Original d410 source and evidence retained.
- Atul acknowledged module/test/small-hook ownership via Johaan; frozen interface in `docs/handoffs/atul-target-review-interface.md`. His Figma layout remains separate.
- Inventory/API/UI implemented with RED→GREEN tests. Initial focused pipeline/history/orientation/selection run: 43 passed. Source reopen, numeric-zero context canonicalization, optional runtime and parser failures have additional failing-first regressions.
- Ruling: preview consumes selected triangles rather than loading the full raw GLB with selected dimensions — otherwise the UI would imply unrelated surfaces were scaled as the target.
- Ruling: mock deployment smoke explicitly reviews all known synthetic fixture surfaces only; production has no default target or automatic selection.
- Ruling: current can acceptance will use an explicitly labeled diagnostic reference, not an invented specimen measurement. Physical fidelity remains unresolved.
- Acceptance complete: frozen snapshot `4f5b63067d217c8b1d1352a8312f4ace4e06053a513606ab38ff177c83a0bf2e`; 390 Python passed/2 optional skips, 94 frontend passed, build/Ruff/Prettier passed. Fresh independent review: no findings; 34 independent backend regressions passed.
- Final ruling: physical specimen fidelity cannot be inferred from a diagnostic 100 mm normalization; report unresolved physical acceptance. Final Figma integration and deployment remain separate owner checks; current-feature Windows acceptance remains untested.
- Real can: manually reviewed Surface 3, X90/Y0/Z0, uniform scalar0.05479503452398729, dimensions22.743269413/22.753138565/100 mm diagnostic only; selected triangles preserved within6.94e-18 m, source/old ZIP retained, downloaded bundle relocated/validated, backend/browser restart restored state, zero reconstruction calls. Exact evidence in implementation handoff.
- Feature remains uncommitted/unpushed for review. Preserve workspace/evidence rather than deleting it: user explicitly requires reproducible evidence and the reviewable patch before integration.
