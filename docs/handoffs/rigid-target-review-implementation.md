# Kamino bounded target review: implementation and acceptance

Ready for master review; no feature merge or push was performed. The isolated
feature branch is `codex/rigid-target-review`, based on the published checkpoint
`724867cea2497a571002e6d0d9ac46d64b604c6f` (`codex/kamino-sizing-gemini-checkpoint`).
The mixed shared checkout and Atul's Figma work were not committed or pushed.

## Source and review identity

The frozen tested/reviewed source has 525 files and content identity
`4f5b63067d217c8b1d1352a8312f4ace4e06053a513606ab38ff177c83a0bf2e`.
Its manifest and snapshot are under `outputs/target-review-acceptance/` as
`review-source-manifest.json` and `review-source/`. Final delivery adds only this
handoff and acceptance ledger text; `final-source-manifest.json` records the exact
delivered tree, and `runtime-parity.json` verifies code matches the tested source.
`rigid-target-review.patch` is relative to the checkpoint and includes new files.
It must be reviewed before integration; do not apply over Atul's UI wholesale.

Branding is already reconciled in the checkpoint. The branding/docs-only patch
from exact d4107843 remains in
`outputs/checkpoint-acceptance/checkpoint-branding-and-docs.patch`, SHA-256
`62525fc06432b4aeee1e5389191107c643dafb7455325d0fb8d9417abce51a0a`.
Atul's `fa8db862...`/`codex/kamino-ui` was still unavailable from origin at the final
check. No byte-for-byte comparison is claimed. Compare its distinct changes once
published; do not apply duplicate branding blindly.

## Implementation choices and changed files

- `assets/target.py` inventories exact-seam edge-connected surface islands after
  scene-node transforms. IDs bind the source bytes, algorithm, node and faces.
  Exported geometry is not welded/repaired; separate scene instances remain
  separate. Manual selection may include several islands; the default is empty.
- `api/target_review.py` adds authenticated inventory and explicit review routes.
  Review binds source SHA, selected IDs, saved orientation and input revision.
  `contracts.py`, `assets/sizing.py` and `assets/prepare.py` carry this provenance
  and use selected triangles for preview/preparation.
- `api/app.py`, `rigid_history.py` and `pipeline.py` enforce the current context
  and explicit reference binding before claim and again during preparation.
  Changed source/selection/orientation invalidates correspondence. Historical
  downloads retain access; new attempts, including legacy regeneration, require
  review. Existing atomic claims and input-publication failure handling remain.
- `frontend/src/target-review.ts` and its tests own the isolated selection/review
  behavior; `main.ts` is the workflow hook, with client/types/mock changes and a
  selected-only `viewer.ts` preview. Async results preserve newer local drafts.
  `workflow.test.ts`, `target-workflow.test.ts`, `upload.test.ts` and
  `viewer.test.ts` cover blocking/invalidation and existing Gemini compatibility.
  Atul retains Figma layout ownership; his exact integration contract is
  `docs/handoffs/atul-target-review-interface.md`.
- Backend fixtures/tests cover real API processing, multiple smaller islands,
  exact seams, scene instances, invalid IDs, stale source/orientation/revision,
  snapshot preservation and regeneration. Deployment smoke explicitly reviews
  all surfaces of its known synthetic mock fixture only. API and sizing docs
  describe the tightened processing requirement and historical compatibility.

No automatic object choice, largest-island rule, universal rotation, threshold
removal, semantic identification, dimension proposal, CAD or reconstruction work
is introduced. Fused/unfaithful geometry remains unresolved.

## Validation

On the frozen version: **390 Python passed, 2 optional skips** (211.50 s),
**94 frontend passed**, TypeScript/Vite build, Ruff, Prettier and diff checks
passed. The existing Starlette/httpx deprecation and large JS chunk warning remain.
Logs are under `outputs/target-review-acceptance/`. An independent read-only review
verified all 525 hashes, reran 34 backend tests successfully, and found no
Critical/Important/Minor issues. Physical/deployment/final Figma acceptance was
explicitly outside that review; this chat performed the Mac browser pass below.

Failing-first regressions include selected-only viewer geometry, stale source on
reopening, retained local note during inventory loading, numeric-zero context
canonicalization, orientation mismatch, missing optional runtime and parser errors.
Existing claim/concurrency, source disappearance/change after claim, snapshot write
failure and earlier-export preservation tests remain green. Generic API acceptance
selects two smaller parts, generates, corrects to one part, regenerates and checks
old inputs/ZIP bytes unchanged. No largest component is inferred.

## Exact original can acceptance (Mac)

Input archive SHA-256:
`e828bb548dae9e5828a29689f2e91c96f4069ee4c6aa8b5788a5700d2d01db6d`.
Original GLB:
`5b9ced8ce875c19b18abd171ce328959a443e6eb3103a21202f94280081bf6ec`.
The previously verified original photos/job/attempt from the 44e3aec handoff were
copied into a fresh isolated store, not the manually repaired derivative.
Job `f84d7763-8ede-40e5-8823-43da1239e7e6` and existing Meshy task
`01a170ef-46b9-749f-89d5-e4b1046c3e31` retain identity.

The UI displayed four source surfaces and original photos, with no initial
selection. I manually selected **Surface 3**, the central cylinder, excluded the
side objects/fragment, saved X=90°, Y=0°, Z=0° (native Y becomes Z), and saved a
qualified geometry review. This is asset-specific inspection, not a universal
rotation or automatic largest-surface decision.

The explicitly labeled **DIAGNOSTIC ONLY** reference normalizes the selected
full Z extent to 100 mm; it is estimated, **not a measurement of this can**.
Oriented extents in input units:
`0.41506077349185944 × 0.4152408838272095 × 1.8249828815460205`.
Uniform scalar: `0.05479503452398729` on every axis.
Resulting dimensions: **22.743269413 × 22.753138565 × 100 mm**.
Mass remains the original estimated 260 g; unknown friction remains unknown.

The completed original job was corrected and generated from its existing GLB
through the UI. New attempt: `452f3a1f-de53-4257-a00d-81cc265f1d83`.
Prepared geometry has 37,604 vertices / 75,212 faces, all selected triangles,
with maximum error versus rotated/centred/uniformly scaled source
`6.938893903907228e-18 m`. Reference saving was required after target review;
UI/API synthetic regressions cover selection/source/orientation invalidation.

The UI-downloaded diagnostic ZIP SHA-256 is
`f5b8d381798490dc7dfed80f355713bf4713c5b1779271f7f864b217e96e2b75`.
It matched the job's saved ZIP, was extracted into a fresh directory and passed
original/relocated MuJoCo 3.3.7 checks, including collision dimensions and cuboid
approximate inertia. Source plus 14 original/copied files are byte-identical.
Original ZIP remains
`53ab115fe9b364f14b6fc0ec3f309c73e2d009fef34c7e74480ca0f19425cf13`.
Both retained attempts, reports and available inputs remain downloadable. Backend
restart + browser reload restored selection, orientation, reference and dimensions.
Fresh browser console warnings/errors: none. Provider guard recorded **zero calls**;
no real Meshy/Gemini credentials or adapters were used.

Evidence: `can-acceptance.json`, `can-before.json`, `can-after.json`, source hashes,
`can-downloaded-validation.json`, browser AX/screenshots, diagnostic ZIP and the
reproduction/guard scripts. One artifact-verification run was interrupted by this
chat's intentional server restart (connection refused); the unchanged read-only
verification passed after restart. This was harness ordering, not product failure.

**Software acceptance passed. Physical geometry acceptance remains unresolved:**
the central reconstruction is elongated, and no specimen measurement or compatible
reference is verified. Uniform scaling preserves that source shape. Selection
excludes distractors but does not reconstruct the intended shape. Current-feature
Windows acceptance is **not tested**; Srijan owns it. Atul's final layout integration
is also pending. These do not alter prior charger-specific evidence.

## Reproduction and integration

Apply the patch to the clean checkpoint, install the existing dependencies and run:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python -B -m pytest -q -p no:cacheprovider
cd frontend
pnpm test
pnpm build
```

The ignored `serve_can.py` uses the exact original handoff, a fresh SQLite store,
explicit blocked reconstruction provider and isolated localhost ports 8137/5207.
It never reads `.env`. Use new data/output directories for another reproduction;
preserve this evidence and prior downloaded ZIPs. The old d410 reproduction and
source archives retain their original hashes. Master decides integration; Atul
should port the documented module/hook behavior into his Workspace layout.
