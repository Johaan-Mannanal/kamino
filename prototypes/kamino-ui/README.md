# Kamino UI prototype

Latest reviewed Kamino interface, preserved as an independent Vite/TypeScript application. It is additive to the repository and can run on another computer without Atul's working directory, credentials, Figma session or browser process.

## Run on Windows or macOS

Install Node.js 22.12+ and pnpm 11.25.0. From the repository root:

```sh
cd prototypes/kamino-ui
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:5188. If the port is already in use, stop the other development server or pass a different port. Dependencies are pinned in pnpm-lock.yaml. No environment file or provider key is needed.

For a production build and local preview:

```sh
pnpm build
pnpm preview
```

## Current UI

- Dark Studio typography; no font toggle or homepage footer.
- White upright mug: orthographic presentation camera keeps the opening rim level and the sides vertical. Workspace retains an orbitable perspective camera.
- Larger opening eases into a reserved capture layout before the phone and photos appear. Grid is subtle and aligned through the mug's actual camera. Cursor glow is restricted to the homepage and disabled for touch/reduced motion.
- Native reversible scrolling. Object pose/progress can stop at any intermediate position. Text and overlays finish their short transitions independently, avoiding invisible headings or half-faded panels when paused. Threshold hysteresis prevents jitter; the page does not automatically snap.
- Own-photo selection/drop/removal connects to the configured API for real job status and authenticated geometry. The explicit demo remains procedural and performs no reconstruction.
- Editable orientation, known full-extent reference axis/length, uniform sizing, mass and optional friction. Manual input remains available. Save explicitly applies the draft before export.
- The presentation omits Revision history and Asset structure panels; compact attempt downloads preserve earlier simulation files.
- Live downloads use the actual validated MuJoCo bundle. The separate demo export contains mesh.glb, properties.json and README.txt and is explicitly unvalidated.

## Run against the Kamino API (live mode)

This UI source (accepted backend/frontend source `724867cea2497a571002e6d0d9ac46d64b604c6f` plus the portable UI `9600d529756b9e7294d323c39230bdfb901fe46e`) was imported as source onto `codex/web-workflow`. It is a local integration, not a new deployment. See `docs/handoffs/2026-10-24-ui-integration.md` for the handoff, review notes and known limitations.

Live mode imports the accepted `frontend/src` API client (`api.ts`), uniform-sizing validator (`sizing.ts`), types and authenticated mesh viewer (`viewer.ts`) directly, so install the accepted frontend's dependencies as well:

```sh
cd frontend && pnpm install --frozen-lockfile && cd ..
# Backend, from the repository root (see the root README for the simulation environment)
PHOTO2SIM_CORS_ORIGINS=http://127.0.0.1:5188,http://localhost:5173,http://127.0.0.1:5173 \
  python -m uvicorn photo2sim.api.app:create_app --factory --host 127.0.0.1 --port 8000
# UI
cd prototypes/kamino-ui && pnpm dev
```

PowerShell: `$env:PHOTO2SIM_CORS_ORIGINS = 'http://127.0.0.1:5188,http://localhost:5173,http://127.0.0.1:5173'` before starting uvicorn.

UI variables (shell or `prototypes/kamino-ui/.env.local`; Vite reads them when it starts, so restart `pnpm dev` or rebuild after changing them):

| Variable | Default | Use |
|---|---|---|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | Kamino API. Use `http://127.0.0.1:8001` for offline acceptance (below). |
| `VITE_KAMINO_ASSEMBLY_URL` | `http://127.0.0.1:5173/assembly.html` | Link to the existing assembly page served by `frontend` (`cd frontend && pnpm dev`, port 5173). Only http(s) URLs are accepted; anything else falls back to the default. |

Never put provider keys in UI variables. The application token is not a UI variable: you type it into the token dialog, and it is held only in memory for the tab.

### Offline acceptance (synthetic, no provider calls)

`tools/ui_acceptance_server.py` runs the unchanged application API on `127.0.0.1:8001` with the mock reconstruction provider, empty provider keys, the application token `ui-acceptance-only`, external network blocked, and data isolated under `outputs/ui-integration/data`. It never reads `.env`.

```powershell
# Terminal 1 — repository root
.venv-sim/Scripts/python tools/ui_acceptance_server.py
# Terminal 2 — UI pointed at the acceptance API
cd prototypes/kamino-ui
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8001'
pnpm dev
# Terminal 3 — optional scripted run (expects Terminals 1 and 2)
node prototypes/kamino-ui/scripts/verify-live.cjs
```

`verify-live.cjs` reads `KAMINO_BASE_URL` (default `http://127.0.0.1:5188`), `KAMINO_API_URL` (default `http://127.0.0.1:8001`) and `KAMINO_BROWSER` (optional browser executable; the static check scripts use `KAMINO_BROWSER_EXECUTABLE` instead). It writes results and screenshots to `outputs/ui-integration/`.

Cached Gemini suggestions in acceptance are a synthetic fixture. After a mock job exists, `.venv-sim/Scripts/python tools/ui_acceptance_server.py --seed-job <uuid>` writes `suggestions/gemini.json` with model `offline-synthetic-fixture`, estimated values whose notes say they are synthetic, the clarifying question "Which full extent is the reviewed reference?" and the note "Offline synthetic fixture; no Gemini request was made." **Refresh (new request)** then fails with category `not_configured`, because the acceptance server has no Gemini key; manual entry stays available.

Flow:

- Choosing your own photos and **Create mesh** uploads them as repeated `images` fields through `BackendSession`. The job id is stored as `?job=<uuid>`; reloading restores it from the server. Selected photos stay on the upload page after an error.
- The loading page shows the actual server status/progress. The workspace opens only once the job has a mesh (awaiting properties or later).
- If the API uses `PHOTO2SIM_API_TOKEN`, a token dialog appears on 401 (or via **Application access token** on the upload page). The token is held in memory for the tab, sent only as a bearer header and never stored or placed in a URL.
- Workspace inputs start blank or with saved values. Sizing is uniform with one full-extent reference (axis, length, unit, source, description) plus an explicit correspondence acknowledgement. **Preview dimensions on server** calls the sizing-preview endpoint and shows the server's dimensions and scale factors. **Save reviewed properties** saves orientation, then requests the server preview, then saves properties. Edits made while saving stay unsaved.
- **Generate simulation** is separate and only enabled for saved, current, valid inputs. Status comes from the server (preparing, validating, completed, failed). The simulation bundle download is only offered for completed jobs with a bundle. Validation reports, exports, diagnostics and every earlier attempt stay downloadable.
- Gemini suggestions: the saved server cache is read on entry without changing the draft. **Request** / **Refresh (new request)** run only when clicked (an optional hint is sent). **Request** may return the server's matching cache instead of calling Gemini. The model, requested model and fallback come from `suggestions/gemini.json` when available. Error categories, retry hints and manual-entry availability are shown, with no automatic retries. Each known value is shown with its `source` (normally `estimated`) and note. Unknown values are shown as unknown, and the draft is left unchanged.
- Gemini `clarifying_questions` and `notes` are shown verbatim as lists under the values. The existing `notes` array may hold the likely object or category, the visual evidence behind it and its uncertainty. The UI does not parse, reword or save these strings, and it has no separate identification step.
- Selected known values are copied into the draft only on **Apply selected to draft**. Applied values keep their `estimated` source and note while you leave them unchanged. Editing a value or its source drops the note. A dimension suggestion can only become the single uniform sizing reference, and it clears the full-extent acknowledgement so you must confirm it again. Applying marks the draft unsaved and disables **Generate simulation** until you **Save reviewed properties**.
- The viewer uses the accepted `mountViewer` (authenticated GLB/OBJ, Z-up, fixed X→Y→Z rotations, disposal on navigation). It shows geometry only; collision geometry is generated during preparation and is not rendered.

## Prototype boundary

**Use demo photos** / the homepage demo stay explicitly synthetic: procedural demo geometry, no upload, no reconstruction and no provider request. Their suggestions are fixed example values. Demo state lives in browser memory and resets on reload. Collision mode in the demo is an illustration. The demo ZIP is a prototype geometry/properties package, not a validated simulation bundle. Live mode never uses this ZIP.

Live mode depends on the accepted frontend/backend source; it does not modify those files, add API fields or change backend prompts. Bright Data is out of scope (parked). See HANDOFF.md for the original wiring brief. The source branch base was c38c95c7211b790dfd7c624f7482b9eaabb0ce58. Existing frontend/backend files are not overwritten by this delivery.

## Checks

```sh
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

`pnpm test` also runs the live-mode unit tests (`backend-session`, `live-workspace`, `live-navigation`). The browser command covers the prototype/demo pages only: it starts a separate preview on port 5189, runs all four check scripts, then stops that preview. Live-mode browser acceptance is the separate `scripts/verify-live.cjs` described above. Screenshots, downloaded demo ZIPs and result JSON go under ignored evidence/generated/. For an already running server set KAMINO_BASE_URL; the harness will not start or stop that server. KAMINO_BROWSER_EXECUTABLE optionally selects an installed compatible Chromium-based browser; the default uses Playwright's installed Chromium. KAMINO_EVIDENCE_DIR optionally chooses the artifact directory.

Windows overrides, when testing with an existing Edge installation:

```powershell
$env:KAMINO_BROWSER_EXECUTABLE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
pnpm test:browser
```

Committed evidence describes the actual machine and commands used. Windows behavior is verified; a macOS execution is still to be performed. The scripts use portable project/dependency paths and a configurable browser executable.

## Assets

All 33 content/icon assets in public/assets were supplied by the Figma design context and downloaded locally. No temporary Figma asset URL is used at runtime. They are the illustrative mug/photo artwork, not private charger photos. Studio uses local Segoe UI with an Apple system/sans fallback; no proprietary font files are redistributed. No keys, tokens, environment files, original photo archives or generated dependency directories are included.

## Current verification limits

See `docs/handoffs/2026-10-24-ui-integration.md` and `outputs/ui-integration/REPORT.md` for final results. The named target-review v2 patch was unavailable and is not applied; the user approved recording that limitation. Bright Data and the separate backend Gemini prompt patch are outside this delivery. Local synthetic browser success is not final Windows/native viewer or hosted acceptance.
