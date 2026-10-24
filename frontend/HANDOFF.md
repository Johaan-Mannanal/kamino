# Core frontend completion — 2026-10-24

Current completion is on `codex/frontend-demo-completion`, based on backend commit `2ceb121`. The earlier Windows handoff below is retained as historical evidence. This section supersedes its deferred viewer/orientation/Gemini items.

- Added authenticated GLB/OBJ preview with orbit/zoom, Z-up camera, loading/error states and download fallback. Preview uses `job.mesh_path` only; prepared files are downloadable and never get rotation applied twice. Existing GLB scene transforms are retained, then the orientation parent applies fixed-axis `Rz @ Ry @ Rx`, followed by preview bounding-box centring. Dimensions are not inferred or scaled in the raw preview.
- Added X/Y/Z degree drafts, validation (-180 to 180), explicit preview and PATCH save, persisted state readback, and process blocking while either property or rotation edits are unsaved.
- Added explicit GET cached suggestions and POST requests/refresh. Suggestions show unverified values, notes and questions. Applying requires confirmation and changes only the editable draft; saving properties remains a separate operator action. Busy/unavailable requests keep existing values and estimates, with manual entry available. No provider keys enter browser code.
- Reused the viewer canvas across unrelated renders. Disposal invalidates pending loads and frees geometry, materials, textures/ImageBitmaps, controls, animation frames, resize observation and WebGL contexts. Artifact downloads still use authenticated fetch plus temporary Blob URLs; no app token appears in artifact URLs.
- Standalone UI mock original/relocated results now say “Simulated pass/failure”; live MuJoCo checks retain actual results. Duplicate-upload protection stays covered.

## Run this revision

Use the existing backend instructions below; choose ports that do not collide with another developer. For the acceptance run here, backend used `8001`, frontend `5174`, exact backend CORS `http://127.0.0.1:5174`, and an ephemeral local application token entered through API access. Provider keys were absent and the server provider explicitly `mock`.

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm test
pnpm build
VITE_API_MODE=live VITE_API_BASE_URL=http://127.0.0.1:8001 pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort
```

The application token remains memory-only and must be entered again after a full page reload. Reopen with `?job=<uuid>` and use API access to restore a protected job. Without live mode, the standalone synthetic UI mock remains the default. GLB previews require embedded resources; external GLB texture URLs are rejected with a download fallback. OBJ preview is geometry-only. WebGL must be supported by the browser.

## Acceptance evidence for this revision

Runtime: Node **22.19.0**, project-selected pnpm **11.25.0**, TypeScript **5.9.3**, Vite **7.3.7**, Three **0.180.0**; Python **3.13.7**, MuJoCo **3.3.7**, NumPy **2.5.4**. Full frontend tests: **21 passed**. Production build passes; Vite emits its advisory warning for the approximately 629 kB Three-containing bundle (163 kB gzip).

Isolated local data: `/private/tmp/frontend-completion-acceptance`, seeded job `68a8fb91-106f-4fd1-9db1-ff893d06d942`. The seed copied `examples/reconstruction/apple-20w-charger-cleaned/mesh.glb` and its estimated properties into a new job; Gemini GET data was seeded from the checked-in suggestion example. There was **no new photo reconstruction or successful Gemini generation** in this acceptance run. The job's provider label records original Meshy provenance, while this local server was configured `mock` with no provider credentials. Source photos were not reseeded (zero photos in this isolated cache).

Browser verified: protected job first returned 401, token entry restored it, authenticated charger GLB loaded, +90° X made the pins upright, orbit and scroll zoom changed the view, PATCH saved all angles, cached estimates did not change X=43 mm, manual X=44 survived an actual unavailable refresh (503), explicit apply placed 42/27/58 mm and 58 g in the editable form, then Save properties and Generate simulation completed through the real backend. All property provenance remains estimated, friction unknown. The browser downloaded the actual authenticated ZIP. Its `asset.json` records `{x_deg:90,y_deg:0,z_deg:0}`. Original and relocated checks passed; extracting that exact browser ZIP elsewhere and rerunning the actual validator also passed both checks. Browser layout at 390 px had `scrollWidth == clientWidth == 390` and retained the viewer canvas.

Evidence committed under `frontend/evidence/completion/`:

- `cached-charger-completed.png`: full browser completion page, reviewed property provenance, preview and actual validation results.
- `cached-charger-orbit.png`: changed camera view after drag and scroll.
- `cached-charger-mobile.png`: responsive completion page.
- `cached-charger-browser.zip`: actual browser-downloaded scene bundle, not the standalone UI mock.
- `validation-report.json`: packaged report; `relocated-browser-zip-report.json`: independent revalidation of extracted browser ZIP.

The GLB browser inspection verifies rendering and the selected orientation, not geometry fidelity or native MuJoCo viewer acceptance. Validator scope remains the upright box-proxy smoke test; `viewer_inspected` remains false. This work does not establish SO101 live-versus-simulated motion, robot calibration, Windows/native viewer acceptance, physical fidelity, public deployment, Agentverse/ASI:One registration, or a second real-object acceptance. Those remain separate team work. Optional Fetch deployment/seed/auth policy work was outside this completion scope and was not changed.

---

# Send to the other computer

Branch: `codex/web-workflow`. Merged `origin/codex/backend-pipeline` through `3b614d4`, including Johaan's pipeline integration `43ad99e`. No merge into main was performed. See the final chat handoff for the pushed feature commit SHA.

## Run

Tested on Windows with Node **24.22.1**, pnpm **11.25.0**, Python **3.12.4**, Vite **7.3.7**, MuJoCo **3.17.0**, NumPy **2.5.4**, and trimesh **5.2.0**.

```powershell
# Repository root, using a separate simulation environment
py -3.12 -m venv .venv-sim
.\.venv-sim\Scripts\python.exe -m pip install -e ".[dev,simulation]"
$env:PHOTO2SIM_PROVIDER="mock"
.\.venv-sim\Scripts\python.exe -m uvicorn photo2sim.api.app:create_app --factory --host 127.0.0.1 --port 8000

# Another terminal
cd frontend
pnpm install --frozen-lockfile
# Create .env.local with VITE_API_MODE=live and VITE_API_BASE_URL=http://127.0.0.1:8000
pnpm dev
```

Open `http://127.0.0.1:5173`. Port 5173 is strict to match backend CORS. Default mode without `.env.local` is the standalone synthetic UI mock. Application tokens can be entered under API access and remain in memory; provider credentials stay on the server.

## What changed

- `frontend/`: Vite/TypeScript app, pnpm lockfile and esbuild build policy, dark staged UI, API adapter, complete mock responses, property conversion/provenance, validation display, authenticated Blob downloads and retry handling.
- Real HTTP flow: repeated `images` → running-job polling → exact property PATCH → explicit empty POST `/process` → preparing/validating polling → report and completed ZIP. The UI does not equate reconstruction progress with export completion.
- Prepared mesh paths resolve relative to `export_path`; successful ZIP actions require completed status and `bundle_path`. Diagnostic files remain available after failures.
- Live job IDs persist in the page URL, so reloads can restore server state. Selected local photos and property drafts survive request errors. Browser-selected photos need to be chosen again after a full page reload.
- `src/photo2sim/integrations/fetch_agent/` plus dedicated tests: optional experimental ACP service using the same backend API. Root dependencies, schemas, geometry and simulation modules were not edited by the frontend work.

## Verification evidence

- Production build and **9 frontend tests** passed. Tests cover multipart boundaries, empty processing POST, authenticated downloads, network/422 errors, mm/g conversion, unknown friction, ZIP gating, path resolution and retry eligibility.
- Focused merged backend API/pipeline suite: **24 passed, 1 skipped**. The skip is the Windows symlink permission test. Starlette/httpx emitted its upstream deprecation warning.
- Dedicated Fetch tests: **5 passed**, including real signed ACP envelopes with outbound delivery replaced locally, acknowledgements without loops, duplicate message handling, bad signatures/targets, and shared API calls.
- Final full Python suite: **175 passed, 2 skipped** (both host symlink permissions). Root Ruff lint and formatting checks passed. The same upstream Starlette/httpx deprecation warning remains.
- Browser: photo selection, reconstruction, confirmation and mock completion/download; validation failure with diagnostics/retry and no ZIP; live backend mock-provider upload through actual preparation/validation and browser ZIP download; job restoration after reload; responsive checks at 390px and 1280px with no horizontal overflow.
- The real local synthetic job saved 40/50/60 mm as 0.04/0.05/0.06 m, 80 g as 0.08 kg, estimated provenance and null friction. Original, relocated and portability validation passed. The browser ZIP contains `scene.xml`, `meshes/visual.obj`, `asset.json`, `simulation.json`, and the report.
- [Desktop screenshot](evidence/completed-desktop.jpg), [mobile screenshot](evidence/completed-mobile.jpg), [actual live synthetic ZIP](evidence/live-synthetic-simulation.zip), and [actual validation report](evidence/live-validation-report.json) are committed and transfer with the branch. The ZIP is a synthetic cube, not photo reconstruction.

## Design review

The user requested a dark, bare-bones operating tool: photos, object data, process stages, files. Removed the decorative hero, marketing subtitle, footer and top-right API/synthetic status. Retained a prominent synthetic notice because it changes how results must be interpreted. Confirmed values collapse into a compact summary with provenance; unknown friction remains explicit.

Applied the available source guidance from [Impeccable's distill playbook](https://github.com/pbakaus/impeccable/blob/main/.agent/skills/impeccable/reference/distill.md), [Vercel's interface checklist and anti-pattern rules](https://github.com/vercel-labs/web-interface-guidelines/blob/main/AGENTS.md), [21st.dev upload references](https://21st.dev/community/components/s/upload-download), and [Apple's Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines). Impeccable's launcher was not installed; its documented direct-context fallback was used. No third-party component code or visual assets were copied.

## Remaining work / what Johaan needs next

1. Fetch this branch and run the commands above. Existing backend processing/ZIP endpoints are connected; no additional contract change is requested.
2. Test two real objects with provider access, orientation confirmation and native viewer acceptance. This handoff verifies synthetic jobs only. A GLB viewer and orientation editing are deferred; reliable artifact downloads are implemented.
3. Review optional Gemini assistance separately; the frontend currently uses manual property confirmation. Suggestions are not fetched or silently applied.
4. For Fetch, install the optional requirements and see its README. Next: stable HTTPS deployment, Agentverse registration/key and actual address, ASI:One attachment compatibility and authenticated artifact delivery, then a complete chat-only demo and sponsor submission. The adapter is experimental and does not establish sponsor eligibility.
