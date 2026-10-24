# Windows live frontend acceptance — synthetic mock provider

Tested integration `93e5aec87f4f8236abc57cd572092f174ed7cbe4` on Yash's Windows PC, 2026-10-23.
The clean simulation feature branch merged the integration. A charger README-only conflict was
resolved by retaining both the correction-required warning and existing Windows evidence.
No application code or shared interface changes were needed to pass this acceptance test.

## Actual browser workflow

Used the in-app browser at `http://127.0.0.1:5173`, with **VITE_API_MODE=live** and a real local
backend explicitly set to **PHOTO2SIM_PROVIDER=mock**. A new backend data directory and a temporary
private local application token were used. The token was entered in the UI's API access field;
no provider keys or paid reconstruction requests were used. Local token/config files remain ignored.

1. Selected a generated non-personal PNG with the browser file chooser; clicked Upload photos.
2. Observed reconstruction, the prominent Synthetic demo label, and the warning that photos do
   not influence the known mock cube. This is not standalone frontend mock mode.
3. Entered 40/50/60 mm and 80 g, both Estimated, with explicit synthetic-test notes; friction blank.
4. Clicked Save properties, then Generate simulation. Observed geometry, simulation and export
   complete, original/relocated Validation passed, and the headless-only scope disclaimer.
5. Clicked **Simulation ZIP Download** and captured the browser's completed download event.
6. The browser saved `simulation.zip`. Its SHA-256 equals the completed job's server ZIP.
   An unauthenticated request to that ZIP endpoint returned **401**. No token appeared in the URL.
7. Copied that exact browser download to this evidence directory, extracted it into another local
   directory outside the backend job, then ran Windows validation (including another temporary copy).
8. Opened the extracted scene in the native MuJoCo viewer. Blue cuboid visible, resting stably
   on the ground; normal close; zero warning counters. Screenshot and viewer telemetry are separate.

Job `9b3b27bf-805c-4fa0-9aca-e10eba75a62e`, status completed, provider mock, synthetic true.
Confirmed persisted properties: 0.04/0.05/0.06 m, 0.08 kg, estimated provenance and null friction.
The resulting synthetic cube is deliberately scaled into a cuboid; its nonuniform-scaling note is
preserved. This is a workflow test, not real-object geometry or material fidelity evidence.

## Windows results and versions

- Node 24.22.1; pnpm 11.25.0; Vite 7.3.7; TypeScript 5.9.3; Vitest 3.2.7.
- Python 3.12.10; MuJoCo 3.17.0; NumPy 2.5.4; trimesh 5.2.0.
- Extracted browser ZIP passes original and relocated checks: 30,000 steps / 3 simulated seconds
  at timestep 0.0001 s; first contact 0.0639 s; peak penetration 0.451507 mm; settled;
  zero MuJoCo/Python warnings. Original loop wall time 0.925 s; total including relocation 1.803 s.
- Native viewer: 26.292 wall seconds / 24.983 simulated seconds, timestep 0.0001 s;
  no visible instability, zero warning counters, clean exit.
- Frontend: **11 tests passed**; TypeScript/production build passed. No browser console errors.
- Full Python suite: **173 passed, 3 skipped** in 26.00 s. Two skips need unavailable Windows
  symlink privileges; the optional ACP module is skipped because uagents_core is not installed.
  Fetch/ASI:One was not exercised. One upstream Starlette/httpx deprecation warning remains.
- Ruff lint, formatting and pip check pass. No source code fix or physics-threshold change needed.

## Transferable evidence

- `browser-downloaded-simulation.zip`: actual browser download, not fetched by a replacement script.
- `browser-acceptance.json`: job ID, ZIP hash, authentication check and workflow assertions.
- `completed-job.json`: persisted synthetic job/properties/artifact paths; no tokens.
- `relocated-windows-validation.json`: actual post-download Windows checks and timing.
- `frontend-completed.jpg`: actual completed live page with synthetic/provenance/validation labels.
- `native-viewer.png`, `native-viewer-report.json`: separate native viewer evidence.

No local Windows path is needed to transfer these assets; all are committed with this branch.

## Reproduce (already executed; commands for another computer)

Repository root, after installing `.[dev,simulation]` in the isolated environment:

```powershell
$env:PHOTO2SIM_PROVIDER="mock"
$env:PHOTO2SIM_DATA_DIR="outputs/frontend-acceptance-new/backend-data"
$env:PHOTO2SIM_API_TOKEN="<new-private-local-test-token>"
& .\.venv-sim\Scripts\python.exe -m uvicorn photo2sim.api.app:create_app --factory --host 127.0.0.1 --port 8000
```

Another terminal, `frontend/`:

```powershell
pnpm install --frozen-lockfile
# Ignored .env.local: VITE_API_MODE=live and VITE_API_BASE_URL=http://127.0.0.1:8000
pnpm dev
pnpm test
pnpm build
```

Open the frontend, enter the same private local token under API access, and perform the browser
steps above. After the browser download, from repository root:

```powershell
$browserZip="$env:USERPROFILE\Downloads\simulation.zip"
$relocated="outputs/frontend-acceptance-new/relocated-browser-zip"
Expand-Archive -LiteralPath $browserZip -DestinationPath $relocated
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.validate "$relocated/scene.xml" --report "$relocated/windows-validation.json"
& .\.venv-sim\Scripts\python.exe tools/simulation/view.py --scene "$relocated/scene.xml"
```

No runtime blocker was found for this live synthetic workflow. Optional Fetch/ACP acceptance is
separate. Final charger acceptance remains pending a corrected, support-free reconstruction with
confirmed orientation/dimension mapping. Do not use this synthetic success to approve the charger.
