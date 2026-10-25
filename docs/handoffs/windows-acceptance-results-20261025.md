# Windows acceptance handoff for Johaan

Johaan — the single Windows acceptance pass against **`a834763920176f34cafd07a49aa5ea9064bdc545`** is fully recorded. **Acceptance remains BLOCKED: 20 PASS, 8 BLOCKED, 0 checklist FAIL, 0 NOT RUN.** There is also a confirmed UI caption defect and an unresolved initial native backend-suite failure result. This evidence-only branch does not approve release, deployment, physical accuracy or grasp accuracy.

Branch: `codex/windows-acceptance-a834763-20261025`.

- [Completed 28-row record](../../reproductions/windows-acceptance/a834763920176f34cafd07a49aa5ea9064bdc545/run-record.md)
- [Machine-readable summary](../../reproductions/windows-acceptance/a834763920176f34cafd07a49aa5ea9064bdc545/final-summary.json)
- [Full evidence ZIP](../../reproductions/windows-acceptance/a834763920176f34cafd07a49aa5ea9064bdc545/windows-acceptance-a834763-evidence.zip)
- [Archive checksum](../../reproductions/windows-acceptance/a834763920176f34cafd07a49aa5ea9064bdc545/windows-acceptance-a834763-evidence.zip.sha256)

The ZIP is 52,006,310 bytes, contains 267 evidence payloads plus its manifest, and passed CRC and per-payload SHA-256 verification. SHA-256: `987d8c00cd6784f33a18629f0beba78a582ef0c9347063fe8b4e0f74898ebc7b`. Download the raw binary from GitHub, then extract it. Paths in the run record refer to that extracted evidence root. Original investigation history is included once in `can-fixture.zip`; dependency caches, venvs, node_modules, pytest temp trees, credentials and the incomplete source download are excluded.

## What passed

The UI selected the central can from the untouched raw four-surface reconstruction. Saving an added distractor cleared current export pointers and sizing while preserving prior attempts; correcting the selection required a fresh reference review. Manual properties, cached positive/unknown suggestions, explicit Apply then Save, dirty-generation gating, clean refresh/new-tab restoration, and stop/save-failure/restart/explicit-retry were exercised through the UI.

Generation reused cached geometry. A remained byte-identical after corrections, restarts and final reopen. A real validation-stage interruption was verified by a read-only disk record after stopping the isolated backend; restart marked it `processing_interrupted`, the UI offered **Retry simulation**, and explicit retry produced a new completed attempt. This is runtime evidence for R05, not a substitute for the missing R03 failure fixture.

Final saved job `c25fcbbd-cec8-4065-ab36-d829fd9be888`, input revision **17**, completed attempt **`b55c6230-e25c-434d-9015-abb9c72ed189`**. Four attempts are preserved: A, first corrected B, interrupted attempt, and final recovered B. Final `exports/B.zip` SHA-256 is `f8d4d57bc924940eef6f8ba06316797b754d7c7369d854b3926252b628ad53cf`; A is `8eb2b606a74e0fea8040bbf7ce8436f09d4887f72ba4a4e1449b156fe8420569`.

The final bundle was downloaded through the browser, freshly relocated outside the checkout/data tree, audited for local asset references, loaded in a native MuJoCo GUI, closed and reopened. A separate 3-second relocated smoke run remained finite with zero warnings. The packaged validation report is explicitly an upright **box-proxy smoke test**; its `viewer_inspected` flag was not rewritten.

## Remaining work

| Checks | Missing evidence/capability | Owner |
| --- | --- | --- |
| S02, O01, Z03 | Verified front/side/top/underside GUI orbit and shape inspection. Native load, zoom, lid view and stable rest were observed, but automation drags did not demonstrate changed angles. Do not count near-identical captures as multi-angle coverage. | Manual acceptance reviewer / tooling |
| D03 | Actual unsaved refresh cancel/discard/recovery policy. Browser automation returned unchanged dirty form with no exposed dialog and no proven navigation. | Atul + browser/manual acceptance |
| O04 | Exact historical malformed F3 saved-state replay is not supplied. Whole-scene/unrotated drafts were exposed and gated; the immutable bad export remains historical evidence. | Integrated replay handoff |
| P05 | Integrated malformed/truncated/quota/provider-HTTP error replay. Null and local `not_configured` portions passed; newer manual draft overwrite required explicit selection and Apply. | Integrated replay handoff |
| R03 | Integrated preparation/validation-failure fixture and retry. No fixture injection route was invented; unit/UI mocks are supplementary. | Johaan / integrated replay handoff |
| R04 | Reconstruction-provider failure replay. Gemini-unavailable/manual-entry retention was observed locally, but cannot satisfy the provider-failure half. | Johaan / integrated replay handoff |

Atul/UI finding: after a successful Preview then Save, the header/form can say **Saved** while the main caption still says **Server sizing preview · unsaved**. The API record is saved correctly, and clean refresh/reopen clears the caption. Evidence: `ui/O02-saved-preview-caption-mismatch.*` and subsequent saves. No UI patch was made.

Native Windows backend full run: **365 passed, 25 failed, 7 skipped**. Preserve this result. Direct errors included four path-length and two access-denied failures, with downstream failures retained. A separately labeled short-temp diagnostic passed all 25 previously failed cases; it does not waive the first run or establish an application fix. See `backend/README.md`, failure summary, original JUnit/log and `backend/short-temp-diagnostic/` in the ZIP. Legacy frontend **103 passed**, Workspace **99 passed**; both TypeScript checks/builds, Ruff and pip check passed. Existing build-size warnings remain.

## Geometry and operating boundaries

Saved orientation is X=90°, Y=Z=0°. One explicitly reviewed **estimated** 131 mm full-Z reference gives the same scale factor **0.07178149522642335** on every axis. Derived extents are **29.793682931 × 29.806611520 × 131 mm**, matching exported full extents within `6.94e-18 m` (audit tolerance `1e-7 m`). The ~29.8 mm derived diameter disagrees with the historical 57 mm estimate; it was not stretched to match. Final mass **0.30 kg** is estimated QA data; saved friction is **null**, with simulator fallback 0.8 separately disclosed. None is measured ground truth.

Application source remained clean at the tested SHA throughout. No repairs, provider keys, provider submissions/polls, reconstruction, new photos, manual mesh repair, deployment or Railway changes were made. Explicit empty provider settings, MockProvider, forbidden Gemini transport and loopback socket guard stayed active; zero external provider calls were observed and no denied-external ledger entry was recorded. This is application isolation evidence, not an OS-wide packet capture.

Please keep this result immutable. Address the UI/native-test findings and missing acceptance capabilities separately. Any application fix needs a new SHA and an agreed rerun; this branch only publishes the existing pass and its limits.
