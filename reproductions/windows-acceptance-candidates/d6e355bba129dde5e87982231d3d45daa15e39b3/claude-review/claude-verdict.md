# Review of d6e355b against a834763

I reviewed from the diff only, so I did not run tests or see surrounding code. Line numbers are approximate, derived from the hunk headers.

**Summary:** I found no confirmed defect in the saved-caption fix, the newer-draft retention, or the cache-first/dedupe logic. I did find two confirmed defects, one in the importer and one in the page-scroll lock. One unverified safeguard (the Save & generate gate bypass) needs a check before merge. Remaining hypotheses are listed below.

## Confirmed defects

**1. Page scroll lock can leak if mount throws.**
- Where: `prototypes/kamino-ui/src/live-workspace.ts` ≈474–487.
- `document.documentElement.classList.add("live-workspace-page")` and `host.classList.add(...)` run before fallible code: `inspector.insertBefore(..., form)` and `:scope > .prototype-note`, where `!` is a type assertion only. The same applies to the later `update()` call.
- The class is removed only in the cleanup function returned at the very end of mount. If any of that code throws, no cleanup is returned and `html` stays `overflow: hidden; height: 100%`, so Home cannot scroll.
- The new test covers only the normal cleanup path.
- Fix: add the classes after the DOM restructuring, or wrap the rest of mount in try/catch that removes them.

**2. The importer never checks that the historical export exists in the payload.**
- Where: `tools/ui_acceptance_fixture.py` ≈71–83 and ≈110–113.
- `historical.bundle_path` is checked for the `attempts/<uuid>/…` shape, but nothing checks that `bundle_path` is a key in `payload`. The archive entry is `original/attempt/*` and is remapped to `attempt_root/<relative>`.
- If the archive's filename differs from `bundle_path`'s, the clone is created with a dangling `bundle_path`.
- The same applies to `mesh_path`. `model_copy(update=…)` does not validate, and `historical.mesh_path == names[0]` is never asserted. Other `attempts[*]` artifact paths are copied without being checked either.
- Fix: raise if `historical.bundle_path not in payload`, and assert `mesh_path == names[0]`.

## Needs verification before merge

**3. Save & generate bypasses `gate` entirely.**
- Where: `live-workspace.ts` ≈1187–1212.
- `generate.disabled = !(combinedReady || gate.allowed)`. `gate` receives `targetStatus`, but `combinedReady` checks only `editable`, `working`, `invalid`, `target.loading` and `referenceBlocked`.
- If `gate` also enforces target-review status, orientation saved, acknowledgement, or sizing currency, `combinedReady` skips those whenever `needsSave` is true.
- The new test only shows that a target edit blocks the button. It does not cover an unacknowledged or unaccepted target.
- Fix: derive `combinedReady` from `gate` with only the "is saved" conditions relaxed.

## Hypotheses (not confirmable from the diff)

- **Replay log location.**
  - `tools/ui_acceptance_replay.py` ≈45–56 writes `offline-replay.jsonl` inside `data_dir`. The network guard deliberately writes `blocked-network.jsonl` to `data_dir.parent`.
  - If `JobStore` lists `data_dir` children as job directories, `GET /api/jobs` could fail once an event is recorded. No test calls the list endpoint.
  - Moving the log next to `blocked-network.jsonl` removes the risk.
- **Late preview regressing the caption.**
  - `backend-session.ts` ≈602 nulls `sizingPreview` only on the matched-draft branch. The newer-draft branch is untouched, which is right for retention.
  - A preview requested during the save, on the same draft, could resolve afterwards and restore an "unsaved" caption for saved inputs. This depends on whether `previewSizing` bumps `previewRequest` and checks `dirty`. Bumping `previewRequest` in the success branch would close it.
  - No test covers save with a concurrent newer draft or preview.
- **Save then Generate without a preview.** Setting `sizingPreview = null` on save is only safe if `gate` and `update()` treat `job.sizing_result` as the source of truth. If `gate` requires a bound preview, the plain Save then Generate path would stay blocked until the user re-previews.
- **Attempt marker consumed without a request.** In `readInitialSuggestions` (≈695–716), the attempt marker is set before `requestSuggestions`. If that call throws synchronously, for example on its own busy guard, the one automatic attempt is spent with no request made. Separately, a 404 that arrives while `busy` skips the attempt but still sets `initialEstimatesStarted`, so there is no later retry in that mount.
- **Automatic provider call.**
  - Opening an uncached job now sends its photos to Gemini without a click. The earlier comment said requests were explicit only.
  - "Once per session" is per-tab `sessionStorage`, so a new tab repeats the call after a failure. Please confirm this is intended.
  - For a 404 returned by the automatic request itself, the UI text "Automatic request unavailable or already attempted" is misleading.
- **`saveAndProcess` and unsaved target edits.** It snapshots `targetDraftVersion` at call time, so a target edit made before the click is not detected at the session level. Only the UI gate (`referenceBlock`) prevents it. This is a defense-in-depth gap.
- **`ReplayProvider.__init__`.** It does not call `super().__init__()`. If `MockProvider` ever gains instance state, `super().submit` breaks.
- **Importer path check on Windows.** The check at ≈79–81 uses `is_absolute()` and `".."`, which does not reject drive-relative names such as `D:x`. The archive is hash-pinned, so this is hardening only.
- **`is_original_can_fixture` on the clone.** The historical clone differs from the original-can job (`legacy_sizing_allowed=True`, properties present, `provider="meshy"`). If `is_original_can_fixture` is used to authorize seeding or replacement, it may now accept or reject the clone unexpectedly. Its body is not in the diff.

## Checked, no defect found

- **Saved caption.** After Save, `sizingPreview` is cleared only when `draft` and `targetVersion` both match. `dirty` and `sizingPreview` move together, and the new test checks the caption and the viewer key.
- **Newer-draft retention.** `saveAndProcess` compares `draft`, `targetDraftVersion` and `dirty` after save and before `process()`, throwing `SessionCancelledError` on any change. The four-case test covers save failure, numeric edit, target edit and same-job reopen.
- **Cache-first semantics.**
  - `initialSuggestions` dedupes by generation and id, and drops a late cache 404 once a manual request has superseded it.
  - Auth and 5xx cache errors never fall through to the provider.
  - The attempt guard checks both memory and `sessionStorage`.
- **Offline isolation.**
  - Replay is opt-in and unknown scenarios raise.
  - The injected transport never opens a socket, and the loopback-only guard remains.
  - The OpenAPI paths are asserted identical.
  - The processing fault is scoped to one job and fires once.
  - The importer clears `provider_task_id`, creates a new id, and never rewrites the source archive.

## Coverage limitations

- I could not see `readSuggestions`, `markDirty`, `previewSizing`, `process`, `primaryViewer`, `gate`, `referenceBlock`, `JobStore`, `block_external_network` or `isolated_data_dir`.
- The replay tests stub `block_external_network`, so the guard under replay is untested here.
- The historical-import test uses a synthetic archive with `ARCHIVE_SHA256` patched. It does not show that the real pinned archive contains the `original/job-before-repair.json` and `original/attempt/` entries.
- The 409 assertions do not check the error code, so they could pass for the wrong reason.
- This is not a substitute for browser or manual verification of layout and scroll behavior.
