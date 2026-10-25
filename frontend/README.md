# Kamino frontend

Small Vite/TypeScript UI on port 5173. Tested with Node 24.22.1 and pnpm 11.25.0; requires Node 22.12+.

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Copy `.env.example` to `.env.local` and set `VITE_API_MODE=mock` (default) or `live`. In live mode, set `VITE_API_BASE_URL` to the backend origin, normally `http://127.0.0.1:8000`. Restart Vite after changing environment values. Start the Python backend separately with its default `PHOTO2SIM_PROVIDER=mock` to exercise real API jobs; these are still synthetic cube jobs. The mode banner and each job's provider/synthetic fields identify this.

Mock mode returns the same `JobRecord` shape and offers completion, provider-failure, and validation-failure scenarios. Its mesh, report and ZIP are labeled UI fixtures; no reconstruction or simulation checks run. It stores jobs in memory and resets on reload. Small fixtures are committed under `fixtures/` and `public/mock/`.

Live mode uses the merged backend's complete pipeline: upload → reconstruction → save properties → explicitly generate simulation → preparation and validation → results. Use the backend's `.[dev,simulation]` installation and run `python -m uvicorn photo2sim.api.app:create_app --factory --host 127.0.0.1 --port 8000` from the repository root. Leave `PHOTO2SIM_PROVIDER=mock` for synthetic jobs without provider charges. Completion and ZIP download require `status == completed` and a non-null `bundle_path`. Failed validation retains diagnostic scene/report downloads; eligible simulation failures can be retried or have properties corrected. Reconstruction failures retain photos but require separate diagnosis before resubmission.

Validation displays original and relocated results, scope, viewer status and geometry assumptions. Prepared mesh paths resolve relative to the scene directory. A GLB viewer is deferred; available OBJ/GLB files can be downloaded.

Protected deployments: open **API access** and enter the application token. It stays in memory, is never put in a URL or public build, and is sent in Authorization headers for API calls and Blob downloads. Provider keys never enter the browser. The application token must be re-entered after reload. Live job IDs appear in the URL so a job can be reopened while its backend storage exists.

Uploads use repeated multipart `images` fields and browser-generated Content-Type. The app polls running jobs at one-second intervals and stops on `awaiting_properties`, `failed`, or `completed`. Dimensions entered in millimetres and mass in grams are divided by 1000 before PATCHing metre/kilogram values. Empty friction is sent as `null`.

See [handoff and verification](HANDOFF.md) for actual browser/build evidence and remaining integration work.
