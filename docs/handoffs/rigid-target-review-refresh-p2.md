# Target-review Refresh P2 correction

Base remains `724867cea2497a571002e6d0d9ac46d64b604c6f`, local branch
`codex/rigid-target-review`; changes remain uncommitted/unpushed for master review.
The original delivery and evidence remain unchanged. This supplements
`rigid-target-review-implementation.md`; it does not supersede physical acceptance
qualifications or imply Windows/hosted acceptance of this correction.

## Confirmed failure and bounded fix

The original loading guard rejected forced inventory reloads. A delayed response
for old source bytes could therefore restore a reviewed state after Refresh and
permit Generate in the UI. Backend processing correctly rejected the changed
source; no backend validation or claim change was needed.

`frontend/src/main.ts` now permits forced inventory loads to supersede pending
ones through the existing sequence guard. Refresh starts this validation before
awaiting the job GET. Loading immediately updates the Generate gate; old responses,
including their error/finally paths, cannot clear the latest request's state.
A returned different mesh path starts validation for that path. Revalidation
failure remains blocked; an unchanged-source response can restore eligibility.

Draft detection ignores the transient loading/error flag only when deciding
whether local target edits may be replaced by refreshed job metadata. The actual
generation gate still checks loading/error. Numeric drafts, unsaved selection and
review notes remain intact. Changed sources still invalidate selected IDs and
reference acknowledgement as before. The frozen module/API interface is unchanged.

## Regression and verification

`frontend/src/target-workflow.test.ts` covers stale-first and fresh-first responses,
fresh inventory failure, failed job refresh/retry with an abandoned response,
unchanged-source recovery, numeric draft retention and unsaved target-review draft
retention across metadata refresh. The original code failed the first four race
cases before implementation; the draft-retention boundary also failed before its
guard correction. Logs preserve RED and GREEN runs.

`frontend/src/workflow.test.ts` retains the late-job-GET-versus-save regression;
it now waits for independent source revalidation before saving, while leaving the
job GET pending. This keeps its original race assertion meaningful.

Final verification: **29 focused tests passed**, **99 full frontend tests passed**,
TypeScript/Vite build, full frontend Prettier check and diff check passed. Existing
large-chunk build warning remains. Backend source/contracts/data/provider code are
byte-identical to the prior accepted delivery; Python was not rerun for this
frontend-only correction. Earlier Python evidence remains 390 passed/2 optional
skips for the unchanged backend. No reconstruction, Gemini or hardware calls.

## Deliveries and identities

All new artifacts are under `outputs/target-review-refresh-p2/`:

- `rigid-target-review-v2.patch`: full replacement patch against clean checkpoint
  724867c. Do not apply on top of the old patch.
- `refresh-p2-only.patch`: incremental correction against the exact previously
  delivered 526-file source; includes this new handoff and the three changed
  frontend files. Use this when the old delivery is already applied.
- `final-source-manifest.json`, `verification.json`, `SHA256SUMS.txt`: updated
  source/patch/package hashes and clean-apply/source-parity verification.
- `rigid-target-review-v2-candidate.zip`: updated source and compact P2 evidence.

Both patch routes are verified to produce the same delivered source. The old
full patch SHA remains
`3aa72647f4ffeb540d9832f7a1e52129cd6b0db17748567073adcbbffd55f895`;
its candidate ZIP remains
`c8ffadedf1d9fa1a35ccef03c6a26b948be0db22f8c391ebfa83c3c44bde19bd`.
The new version requires master integration review with Atul's UI. Then Srijan
accepts one exact integrated SHA on Windows, and master deploys that same version
and repeats hosted acceptance. The can's 100 mm reference remains diagnostic;
physical geometry is unaccepted.
