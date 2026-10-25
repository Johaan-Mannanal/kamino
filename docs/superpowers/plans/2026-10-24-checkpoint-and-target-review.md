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

- [ ] Checkpoint: reconstruct verified d410, apply 25 compatible branding files and five latest master docs; full Python/frontend/lint/build; label exact source; commit/push only isolated branch.
- [ ] Inventory/selection: deterministic edge-connected island IDs tied to source hash; selected subsets permit multiple islands; reject empty/unknown/stale sets; no graph-engine dependency or automatic defaults. RED→GREEN tests.
- [ ] Review/API/persistence: selected geometry preview, source-bound target review, sizing invalidation, claim-time recheck and immutable attempts; historical download preservation; RED→GREEN API/history tests.
- [ ] UI after Atul acknowledgement: dedicated target-review module, explicit visible selection and review, clear unresolved state and re-review; reuse orientation/uniform sizing controls; tests.
- [ ] Acceptance: synthetic distractors/legitimate multipart/seam cases, exact original can, source-change/selection/orientation invalidation, concurrency/history, relocation, browser; final independent review; reviewable feature patch, no integration merge.

## Review focus

Unwelded seams must not lose triangles; node instancing transforms preserve geometry; stale source/selection races cannot process old references; failed retries retain input downloads; multipart objects remain possible without automatic deletion.

## Ledger

- Ruling: use a fresh managed worktree to leave the original integration worktree and all d410 evidence untouched. Only reconstructed source and reviewed branding/latest docs enter the checkpoint.
- Ruling: historical exports remain readable, while user explicitly requires new review for every newly generated attempt. This intentionally tightens processing requests, not historical deserialization/downloads.
