# Combined candidate: master verification

Prepared October 25, 2026. This commit is a Windows acceptance candidate, not a deployment approval. The current hosted site remains running unchanged. Follow [the exact-run instructions](combined-release-windows-acceptance.md); record the full HEAD SHA before testing.

## Source and additions

Based directly on Atul's `2cdc3824a58b4da273d30bd61893828c6962b243`, including target-review v2. Added the Gemini identity/category prompt with uncertainty and no web-search claim; Railway packaging for both the new root UI and existing assembly page; pinned original-can offline import plus known/unknown suggestion caches; and the Microsoft Built for the Real World sponsor assessment. No SO-101 trajectory implementation or hardware changes are included.

Master also corrected automatic polling in `prototypes/kamino-ui/src/backend-session.ts`. Previously each status poll triggered a full geometry preview request. Automatic polls now revalidate at processing completion or a mesh-path change. Explicit Refresh still starts revalidation immediately, supersedes pending requests, rejects stale results and preserves drafts. Three added regressions reproduced the unnecessary request and duplicate mesh-change request before the fix; all existing refresh/race tests remain passing. Target-review source files and backend behavior were not changed by this correction.

## Verification

- Full Python: **395 passed, 2 optional skips** (uagents_core unavailable; CadQuery interpreter not configured). One Starlette/httpx deprecation warning. This run includes the offline importer tests; the later polling correction changes only frontend code/tests.
- Legacy frontend: **103 passed**. Workspace: **99 passed**, including the three new polling cases. Both TypeScript checks and production builds passed.
- Fresh frozen-lockfile installations passed with **pnpm 11.25.0, Node 22.19.0**. Python **3.13.7**, MuJoCo **3.3.7**, NumPy **2.5.4** on this Mac. These are observed versions, not a Windows/container compatibility claim.
- Ruff, changed-file formatting and diff checks passed. Builds retain their existing >500 kB chunk warnings.
- Static packaging produced 44 files, preserving the new root UI and `/assembly.html`. A conflicting-asset fixture was rejected. Both actual pages loaded in the browser from the combined production build.
- The original can archive verified **225 payloads plus MANIFEST.json**. Archive SHA-256 `e828bb548dae9e5828a29689f2e91c96f4069ee4c6aa8b5788a5700d2d01db6d`; raw mesh SHA-256 `5b9ced8ce875c19b18abd171ce328959a443e6eb3103a21202f94280081bf6ec`. Original files were unchanged; no manual derivative was used as input.
- Browser: imported job `7054b75b-05ca-4dfc-b591-0e4e0b029af1`; selected Surface 3, saved X=90° orientation, saved reviewed target and a **diagnostic, estimated 100 mm full-Z reference**, then generated A. Reopened the saved job, corrected estimated QA mass from 0.26 to 0.30 kg, saved and generated B. Two completed attempts remain visible; A was retrieved byte-identically after B.
- Both exports passed original/relocated numerical box-proxy validation. B was downloaded through the browser, extracted outside the checkout and independently run from a different working directory: finite state, 3 simulated seconds, zero warnings. This is not native GUI inspection or grasp acceptance.
- Known, null and unavailable suggestion responses were exercised through the local API; saved properties stayed unchanged. All provider credentials were explicitly empty, external connections were denied by the helper, no blocked network attempt was recorded, and no Meshy/Gemini calls occurred.
- Read-only hosted checks returned 200 for root, assembly and health; unauthenticated job access returned 401. Existing hosted rigid/assembly ZIP hashes stayed unchanged. No service, DNS, credential or billing mutation occurred.

## Export identities and accuracy limits

A: `0f87c92a-fd5a-454e-baec-c7d68b5757b0`, ZIP SHA-256 `e814c6fff2de15d9787f256cc8b5e6509c527d8176920785c6a9bd42ccac1aac`.

B: `9d438468-ea2e-46ac-92d0-259ff2823b36`, ZIP SHA-256 `71c65e0a306e718107878963f380f4c4044538475191c0c11d2302ce52765bb9`.

Uniform scale factor: approximately **0.054795034524** on every axis. Derived extents: **22.7433 × 22.7531 × 100 mm**. These are geometric consequences of a diagnostic reference, not accepted physical measurements. Friction remained unknown; the simulator's fallback is disclosed separately. The mass correction is QA data, not a new measurement.

Before the polling fix, A's numerical loops took about 114/135 seconds while the Workspace repeatedly requested geometry. With the fix, B took about 3.5/4.0 seconds. This is an observed local comparison, not a general speedup benchmark: runtime load and the test mass also differed. The extra-geometry-request regression is independently covered by tests.

## Remaining release gates

Srijan's exact-commit Windows checklist is **NOT RUN**. Missing arbitrary provider/validation failure injection is explicitly identified in the run instructions; record affected rows BLOCKED rather than substituting unit/mock coverage. Atul's earlier Windows fixture/permission failures are not waived by this Mac pass.

Container build and hosted acceptance of this candidate are **NOT RUN**; no Docker runtime was available here. Real-provider acceptance, physical geometry/grasp accuracy and Microsoft agent eligibility/submission remain separate pending items. No claim is made that the whole 28-row Windows checklist already passes.

Local evidence is in `outputs/combined-release/`: test/build logs, source/runtime records, original archive verifier, browser screenshot, A/B ZIPs, final saved record, cache-response checks, preservation hashes and relocated-run output. The master supplies a separate evidence archive and the exact published Git SHA.
