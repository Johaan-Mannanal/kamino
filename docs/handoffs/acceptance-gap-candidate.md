# Acceptance-gap candidate — 2026-10-25

Branch: `codex/workspace-refinements`, parent `637432208385543b86a89ac44e101eb133b8f7c6`. This is a follow-up to the refinement candidate, not a replacement of Srijan's frozen `a834763920176f34cafd07a49aa5ea9064bdc545` results. The published website and original evidence are unchanged. Use the exact delivery commit, recorded by the package, for a new run identity.

## Changes

- Successful Save clears the unsaved sizing preview only when the saved response still matches the current numeric and target drafts. The viewer uses saved sizing, without a geometry reload. Newer in-flight edits remain dirty.
- The local acceptance launcher gains opt-in Gemini response replay, a one-shot processing fault scoped to one job, and a one-shot synthetic reconstruction failure. Existing production routes, settings, provider adapters and pipeline code are unchanged. Fault hooks live only inside the isolated launcher's lifespan.
- The pinned can importer can create a labeled clone of the original F3 bad saved state and attempt. It preserves the bad ZIP, strips the remote task ID and imports no manual repair. This exposes the existing correction/review gates for O04; it does not label old geometry accepted.

## Local setup

Use the repository's documented Python environment and frontend package manager. Set `PYTHONPATH=src` in the launching shell (PowerShell: `$env:PYTHONPATH="src"`). Do not load `.env` or real provider keys. Keep paths short on Windows and preserve Srijan's original long-path result separately.

Choose a new data directory under `outputs/ui-integration`, for example `outputs/ui-integration/acceptance-NEW_SHA`. The importer verifies the pinned archive and every manifest payload before copying. It creates a new job each invocation and prints its ID.

```text
python -m tools.ui_acceptance_fixture --archive PATH_TO_ORIGINAL_CAN_ZIP --data-dir outputs/ui-integration/acceptance-NEW_SHA
python -m tools.ui_acceptance_fixture --archive PATH_TO_ORIGINAL_CAN_ZIP --data-dir outputs/ui-integration/acceptance-NEW_SHA --historical-state
python -m tools.ui_acceptance_server --data-dir outputs/ui-integration/acceptance-NEW_SHA --port 8001
```

Start the real Workspace with `VITE_API_BASE_URL=http://127.0.0.1:8001` and its documented `pnpm dev` command (port 5188). Enter the local-only application token `ui-acceptance-only`. Open `http://127.0.0.1:5188/?job=JOB_ID#workspace`. The launcher allows only loopback network connections and records blocked attempts in the data directory's parent `blocked-network.jsonl`. It never reads launch-directory `.env` or uses real credentials.

## Focused replay commands

Stop only the local acceptance backend before changing its flags. Preserve the same isolated data. These flags never belong in Railway or production startup.

### P05: Gemini error/unknown responses

Add `--gemini-replay SCENARIO`, choosing `positive`, `unknown`, `malformed`, `truncated`, `quota` or `overload`. The fixture applies to every uncached suggestion request in that dedicated launcher. Use the UI's explicit **Refresh (new request)** when a saved cache exists; ordinary Request can legitimately reuse the cache.

All fixture responses stay in process and pass through the real Gemini parser/error adapter. Positive values are synthetic 40/50/60 mm, 80 g and 0.4, not can measurements. Viewing responses must not change drafts or saved properties. Error cases should retain cached estimates and manual edits. Explicitly restore/reconfirm the actual diagnostic can reference before export. The `offline-replay.jsonl` ledger records fixture events without image bodies, keys or headers.

### R03: preparation/validation failure and retry

Add `--fail-processing-job JOB_ID --fail-processing-stage validation` (or `preparation`). Only the named copied job consumes the fault, once per launcher run. Generate via the UI, inspect failure diagnostics and retained inputs, then retry in that same process. Retry uses the real pipeline; the injected validation report explicitly says it is not a physics result. Earlier successful artifacts and the failed attempt must remain separate.

Restarting with fault flags re-arms the fault. For ordinary restart/recovery checks, remove them. Do not confuse an intentional re-armed fault with recovery failure.

### R04: reconstruction failure

Add `--fail-next-reconstruction`, then upload the existing fixture photos through the UI. The first **mock** task fails through the real worker. No remote reconstruction or polling occurs. Uploaded inputs and the failed record remain; a subsequent explicit upload uses the ordinary mock cube. This proves provider-error handling/persistence only, not original-can selection or reconstruction quality. Continue final can acceptance using the imported raw F2 job.

### O04: preserved historical bad export

Use the separate `--historical-state` job. Inspect its original bad attempt and current review gate; keep that ZIP as historical evidence. Attempting to process the completed unreviewed state is rejected. Enter correction through the application and require target/orientation/reference review. The old extreme stretch must not become accepted new geometry merely because its historical physics report passed. Do not overwrite the original job/archive or use the manual F4 derivative.

## Acceptance boundaries

The original 20 PASS / 8 BLOCKED Windows result remains immutable. This delivery supplies capabilities for O04/P05/R03/R04 and fixes the caption; it does not turn those Windows rows into PASS without execution. S02/O01/Z03 still need actual multi-angle visual inspection. D03 still needs the real unsaved refresh/discard behavior recorded. Atul's mobile findings on a834763 must be compared with this later candidate separately.

Review the inherited refinement changes (cached-first request timing, explicit Apply/Save, Save & generate/retry, target/reference invalidation, history and polling without mesh reload). Then run the focused affected rows and final relocated export on the same exact new SHA. Broad repeated verification is unnecessary unless a new failure warrants it. No provider calls, hardware work, physical/grasp acceptance or deployment changes are part of this delivery.

## Master verification

- 111 focused Python regressions passed (fixture importer, replay helpers, pipeline, Gemini adapter and suggestions API). The full backend suite was not rerun. One existing TestClient deprecation warning remains.
- 119 Workspace tests and 103 preserved legacy frontend tests passed. Both TypeScript checks and builds passed; existing large-bundle warnings remain. Ruff, Python formatting, frontend formatting and diff checks passed.
- Actual pinned F2 archive imported into a fresh job; separate F3 historical clone verified. Original archive SHA-256 remains `e828bb548dae9e5828a29689f2e91c96f4069ee4c6aa8b5788a5700d2d01db6d`; the historical ZIP served byte-identically.
- Browser production build: saved X=90 degrees and Surface 3 review, then previewed/saved an explicitly estimated 100 mm full-Z diagnostic reference and 0.26 kg estimated mass. Uniform derived extents were about 22.7 × 22.8 × 100 mm. These are not accepted physical dimensions.
- The caption changed from unsaved preview to saved sizing. Quota error remained actionable with manual entry available. Generate hit the injected validation failure, exposed labeled diagnostics without a successful ZIP, and explicit Retry completed through real validation. Both failed and completed attempts remained in history.
- Retry ZIP SHA-256: `d5d4c8d80999ef8a59476f1f49a2153e1a0b6988c62437f84586f8bd66df79c0`. After independent extraction outside the checkout, MuJoCo 3.3.7 loaded it and ran three simulated seconds, finite with zero warnings. This is numerical portability evidence, not native Windows/viewer or contact acceptance.
- The isolated helper made zero live provider calls. Replay ledger contains the synthetic quota response and the single injected validation failure; no blocked external attempt was recorded.
- GET-only hosted check at 2026-10-25 09:22 UTC: root, assembly and health returned 200; health still reports mock; unauthenticated job access remained 401; existing rigid and assembly ZIP hashes matched earlier evidence. No hosted mutation occurred.

Evidence lives in `outputs/acceptance-gap-review/`: test log, browser screenshots/state captures, final job and both reports, historical gate/clone, fixture receipts, replay ledger, ZIP/relocation result and hosted-preservation record. Candidate delivery includes only selected evidence, not credentials or the data database. No push or deployment was performed.
