# Kamino UI integration handoff (2026-10-24)

## What this is

The Kamino UI in `prototypes/kamino-ui` now has a live mode that runs against the existing Photo2Sim API. The code is source only, imported onto branch `codex/web-workflow`:

- Accepted backend/frontend source: `724867cea2497a571002e6d0d9ac46d64b604c6f`
- Portable Kamino UI: `9600d529756b9e7294d323c39230bdfb901fe46e`

This is not a new deployment. Nothing under `deploy/` changed, and no hosted service, provider or credential was added. No API fields, backend prompt changes, identification screen or can-selection feature were added. Bright Data is parked and out of scope.

Live mode imports these accepted frontend modules directly; it does not modify them:

| Import | Used for |
|---|---|
| `frontend/src/api.ts` (`liveApi`, `ApiError`, `setApiToken`) | Every HTTP call, structured error categories, and the memory-only bearer token |
| `frontend/src/sizing.ts` (`makeSizing`) | Uniform full-extent sizing validation |
| `frontend/src/viewer.ts` (`mountViewer`) | Authenticated GLB/OBJ viewer: Z-up, fixed X→Y→Z rotations |
| `frontend/src/types.ts` | `Job`, `Properties`, `Sizing`, `SizingPreview`, `Suggestions`, `Scalar`, `Source` |

UI-owned files: `src/backend-session.ts` (holds saved server state), `src/live-workspace.ts` (pure helpers and the workspace DOM), `src/live-navigation.ts` (keeps an accepted upload's identity when the user leaves the page), and `src/main.ts` (routing; keeps the demo and live modes apart).

## Run commands

Install dependencies (both packages are needed because live mode imports `frontend/src`):

```sh
cd frontend && pnpm install --frozen-lockfile && cd ..
cd prototypes/kamino-ui && pnpm install --frozen-lockfile && cd ../..
```

### Real API mode

```powershell
# Repository root
$env:PHOTO2SIM_CORS_ORIGINS = 'http://127.0.0.1:5188,http://localhost:5173,http://127.0.0.1:5173'
python -m uvicorn photo2sim.api.app:create_app --factory --host 127.0.0.1 --port 8000
# UI (VITE_API_BASE_URL defaults to http://127.0.0.1:8000)
cd prototypes/kamino-ui; pnpm dev   # http://127.0.0.1:5188
```

If the API has `PHOTO2SIM_API_TOKEN` set, the UI asks for the token on a 401, or you can enter it from **Application access token** on the upload page. The token is held in memory for the tab only. It is sent as a bearer header and never written to storage or a URL, so after a reload you must enter it again.

### Offline acceptance mode (synthetic)

```powershell
# Terminal 1 — mock provider, empty provider keys, token ui-acceptance-only, port 8001,
# external network blocked, data under outputs/ui-integration/data, never reads .env
.venv-sim/Scripts/python tools/ui_acceptance_server.py
# Terminal 2
cd prototypes/kamino-ui; $env:VITE_API_BASE_URL = 'http://127.0.0.1:8001'; pnpm dev
# Terminal 3 — scripted live acceptance; writes outputs/ui-integration/browser-results.json
node prototypes/kamino-ui/scripts/verify-live.cjs
```

Synthetic cached Gemini: after a mock job exists, run `.venv-sim/Scripts/python tools/ui_acceptance_server.py --seed-job <uuid>` (add `--replace-seed` to overwrite). It writes `suggestions/gemini.json` with model `offline-synthetic-fixture` and these contents:

- `dimensions_m` 0.04 / 0.05 / 0.06 m, `mass_kg` 0.08, `sliding_friction` 0.4, all `source: "estimated"`. Each note says it is a synthetic fixture, not a measurement.
- `clarifying_questions`: `["Which full extent is the reviewed reference?"]`
- `notes`: `["Offline synthetic fixture; no Gemini request was made."]`

**Refresh (new request)** against this server fails with category `not_configured` because there is no Gemini key; manual entry stays available.

### Assembly

The assembly workflow is a separate page in the accepted frontend: `frontend/assembly.html`, served by `cd frontend && pnpm dev` on port 5173. Kamino only links to it, through `VITE_KAMINO_ASSEMBLY_URL` (default `http://127.0.0.1:5173/assembly.html`; only http(s) URLs are accepted).

### Unit/build checks

```sh
cd prototypes/kamino-ui
pnpm test        # vitest: demo + live-mode unit tests
pnpm build       # tsc --noEmit + vite build
pnpm test:browser  # demo/prototype pages only (port 5189); not live-mode acceptance
```

## The live flow

1. **Upload.** **Create mesh** sends the user's own selected photos (1–4) as repeated `images` multipart fields to `POST /api/jobs`. The job id goes into `?job=<uuid>`. On an error the selected photos stay on the upload page. If the selection includes demo photos, nothing is uploaded and the synthetic procedural demo opens instead.
2. **Creating mesh.** The status and progress shown come from `GET /api/jobs/{id}`. The workspace opens only when the job has a `mesh_path` and has moved past reconstruction.
3. **Workspace draft.** Fields start blank or with the saved server values; mass, friction and dimensions are never filled in from local bounds or defaults. Sizing is uniform, with one full-extent reference (axis, length, unit, source, description) and an explicit correspondence acknowledgement.
4. **Preview (optional).** **Preview dimensions on server** calls `POST /sizing-preview` and shows the server's dimensions, scale factors and source extents. The UI notes that the server does not verify the correspondence.
5. **Gemini (optional, explicit).** The cached `GET /suggestions` is read on entry and does not change the draft. **Request** / **Refresh (new request)** send `POST /suggestions` only when clicked. The UI displays each known value with its source and note, shows unknown values as unknown, and lists `clarifying_questions` and `notes` verbatim. The existing `notes` array can carry the likely object or category, the visual evidence for it and its uncertainty; the UI does not parse, reword or save these strings.
6. **Apply (explicit).** **Apply selected to draft** copies only the checked known values into the draft. They keep `source: "estimated"` and their note while unchanged; editing the value or source drops the note. A dimension can only become the single sizing reference, which clears the acknowledgement. The draft becomes unsaved.
7. **Save (explicit).** **Save reviewed properties** runs `PATCH /orientation`, then `POST /sizing-preview`, then `PATCH /properties` with the server-derived `dimensions_m`. Edits made while the save is running stay marked unsaved.
8. **Generate (explicit, separate).** **Generate simulation** (`POST /process`) is enabled only when there are saved, current, valid inputs: no unsaved changes, and the saved sizing orientation matches the job orientation.
9. **Downloads.** The simulation ZIP (`bundle_path`) is offered only for `completed` jobs or attempts that have a bundle. The backend writes it only after validation. The validation report, export file (`scene.xml`), inputs and every earlier attempt stay downloadable through authenticated `GET /files/...`.

The demo stays explicitly synthetic: procedural mug, fixed sample suggestions, a prototype ZIP that is not validated, and no upload or provider call. Live mode never uses the demo ZIP.

## Verification and remaining acceptance

The integrated UI and session tests pass (65); the preserved frontend and assembly tests pass (90). Both TypeScript checks and production builds pass. All 100 home/demo/appearance/pause browser checks pass, and the actual downloaded simulation ZIP passes independent relocation validation (`viewer_inspected` remains false). Focused backend sizing, regeneration and suggestions checks pass (43). The isolated live browser flow verifies actual mock upload/reconstruction, authenticated geometry, authoritative uniform sizing, explicit Save/Generate, cached Gemini notes/questions and deliberate Apply, unavailable-service manual entry, real validated ZIP downloads, regeneration preserving earlier ZIP bytes, reopen/token reentry, and mobile layout. No Meshy or Gemini calls occurred.

Detailed machine results, browser screenshots, downloaded ZIPs, logs and delivery hashes are under `outputs/ui-integration/`. This is synthetic local acceptance, not physical fidelity, native Windows viewer acceptance or hosted acceptance. The earlier UI-only 96-test increment is not substituted for these results.

The complete backend run is not green: 353 passed, 13 failed, 8 skipped and 9 errors on this Windows checkout. The recorded failures include unavailable historical capture/robot assets and Windows file rename/access failures. See `python-final-tests.log`; these results must not be represented as a passing full-suite release.

## Missing target-review delivery

The user requested ONE route: `rigid-target-review-v2.patch` for clean `724867c`, or `refresh-p2-only.patch` only after a previous target-review delivery. No previous target-review delivery was applied here. The named files are absent from fetched origin branches, the checkout and Downloads. The user explicitly instructed us to note this in the report and move on.

Therefore neither target-review patch is applied. Numeric drafts, immediate refresh preview invalidation, stale-response rejection and Generate blocking are implemented and tested for the existing Workspace, but target-review fields/draft integration and Johaan's independently verified target refresh fix remain unverified pending the actual v2 delivery. Do not invent an endpoint or claim target-review acceptance.

## Delivery and limits

The combined UI patch is based on clean `724867cea2497a571002e6d0d9ac46d64b604c6f`, with the additive portable UI from `9600d529756b9e7294d323c39230bdfb901fe46e`. It includes the new UI assets, lockfile, API error handling and offline acceptance tooling; it does not include dependencies, generated builds, private photos or provider credentials. A source-tree identity and SHA-256 manifest accompany the patch. The user authorized publishing this review candidate to `codex/web-workflow`. Publishing is not a final Windows/hosted acceptance freeze, and no hosted deployment changed.

Specification lookup is outside this delivery: Bright Data is parked. Gemini's likely-object/category, supporting evidence and uncertainty remain displayable in the existing `notes` array; the separate backend prompt patch is not included. No new identification screen or API fields were added.

The live UI links to the preserved assembly page. Advanced independent-axis/legacy jobs are labeled and can be corrected to reviewed uniform sizing; previous attempt files remain available. Geometry preview does not establish collision or real-world accuracy. Browser testing is local Windows/Chrome only; macOS and final Windows/native/hosted acceptance remain separate. The Three.js chunk exceeds Vite's advisory size threshold.
