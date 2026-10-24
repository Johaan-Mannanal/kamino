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
