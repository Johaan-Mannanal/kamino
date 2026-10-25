# Live Workspace with target-review v2

The full target-review v2 delivery is now applied and connected to the live
Workspace in `prototypes/kamino-ui`. This supersedes the earlier UI handoff's
statement that the target patch was unavailable. The historical handoff and its
evidence remain unchanged.

## Source and custody

The incremental integration base is
`b61383f0c17d3f81ef72ffdbe9640da2e193bede` on `codex/web-workflow`.
The accepted sizing/Gemini checkpoint is
`724867cea2497a571002e6d0d9ac46d64b604c6f`; the additive UI delivery is
`9600d529756b9e7294d323c39230bdfb901fe46e`.

The full input patch was applied once, not layered over the old target delivery:

`rigid-target-review-v2.patch` SHA-256
`94e8c90dac00020b74d542d706142a48b30b0c6af8bc835b44e8850564297cef`.

Final candidate commit/tree, input-patch identity, included-file checksums and
verified incremental-apply result are recorded in
`outputs/target-ui-integration/source-identity.json` and `source-manifest.json`.
The package's `APPLY.md` names its required base. Do not apply the full input
patch again to this integrated delivery.

## Connected behavior

- Geometry inventory has no automatic target selection. Explicitly choose all
  surfaces belonging to the intended object; several separate surfaces may be
  legitimate. The all-surface preview distinguishes selected and excluded geometry.
- Save orientation before target review. Save the source-bound target review,
  then explicitly acknowledge and save the full-extent sizing reference. Uniform
  dimensions come from the server and bind to the saved geometry context.
- Source, selection and saved-orientation changes invalidate reference
  acknowledgement without deleting numeric drafts. Unsaved target edits, pending
  requests and failed revalidation keep Generate disabled. Refresh starts forced
  source revalidation before awaiting job metadata; stale successes, failures and
  completion handlers cannot replace the newest request's state.
- A failed metadata refresh remains blocked until a current metadata read or
  confirmed mutation succeeds. An inventory retry alone cannot clear that failure.
  Optional Gemini unavailability remains separate and leaves manual entry usable.
- Target and numeric drafts survive in-tab navigation. Authenticated source,
  diagnostic and historical bundle downloads remain available. New generation
  still requires current target/reference review; old completed exports do not.
- The primary geometry preview uses the selected surface set. Server scale is
  displayed only when the preview explicitly returns the current geometry context;
  absent or different bindings are not silently accepted.

The frozen module/API contract remains in
[Atul's interface handoff](atul-target-review-interface.md), with the
[Refresh P2 correction](rigid-target-review-refresh-p2.md). No new product endpoint
or provider prompt was invented for this integration. The existing assembly route
and explicit procedural homepage demo remain available.

## Verification and evidence

The legacy frontend suite passed **103 tests**. The final prototype suite passed
**96 tests** (38 controller, 11 target UI helpers, 29 Workspace DOM, three
navigation and 15 demo tests); TypeScript and production build passed. The focused
combined backend suite passed **55 tests**, including the **12 target geometry/API
tests**. The final production static build (`index-BOEezWRK.js`) passed all ten
actual local API browser groups, the multipart correction/history checks and four
separately mocked delayed-GET race cases. All four browser-downloaded ZIPs passed
independent relocated validation; `viewer_inspected` remains false. No external
requests or browser errors were recorded. Final artifact/result fingerprints are
in the package's `final-browser-acceptance.json` and
`final-tested-static-artifact.json` evidence.

The full backend suite is **not green**: **369 passed, 8 skipped, 9 failed and
9 errors**. The detailed retained log has **143,401 bytes**, SHA-256
`aa4d269981458abaaed35b041a1541b08715cb7166ff885677c0998a4228dbdf`.
The 18 nonpassing cases comprise 14 missing-fixture cases and four direct Windows
staging-directory rename/publication permission failures. They remain nonpassing;
no fixtures were substituted or tests silently reclassified as passes.

- [Full backend detailed output](../evidence/target-ui-integration/full-backend-detailed.txt)
- [Triage and comparison with the pre-target baseline](../evidence/target-ui-integration/backend-triage.md)
- [Machine-readable triage](../evidence/target-ui-integration/backend-triage.json)
- [Target-focused backend output](../evidence/target-ui-integration/target-backend-tests.txt)

The actual local browser harness exercises authenticated upload, explicit target
review, bound uniform sizing, preparation/validation, ZIP downloads, Gemini
cache/Apply/Save/manual fallback, regeneration, reopen and mobile layout. A separate
synthetic three-box fixture selects two smaller pieces, excludes the larger
distractor and exports 24 selected faces; correcting selection changes context
while preserving the first ZIP. This is an explicit test selection, not an
automatic selection rule. Delayed GET race scenarios are recorded separately as
mocked browser transport checks. The package contains the result JSON, screenshots,
downloaded synthetic ZIPs and static-build fingerprints.

## Run and boundaries

Follow `prototypes/kamino-ui/README.md` for dependencies and live API configuration.
For offline synthetic acceptance, run `tools/ui_acceptance_server.py`; it uses
explicit mock settings, empty provider keys, isolated data, a local test token and
loopback-only networking. It does not load `.env`. Start the UI with
`VITE_API_BASE_URL=http://127.0.0.1:8001`. Save/review/generate through the actual UI;
do not substitute a repaired mesh to claim selection acceptance.

This delivery makes no physical can-fidelity, measured-dimension, hardware,
Windows native-viewer or hosted-production acceptance claim. Numerical simulation
checks and human geometry review have separate scope. Railway deployment, Bright
Data and the separately owned Gemini prompt patch are unchanged. No real provider
generation or hardware calls were made during these integration checks.
