# Photo2Sim frontend

Small Vite/TypeScript UI on port 5173. Requires Node 20.19+ or 22.12+ and pnpm.

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Copy `.env.example` to `.env.local` and set `VITE_API_MODE=mock` (default) or `live`. In live mode, set `VITE_API_BASE_URL` to the backend origin, normally `http://127.0.0.1:8000`. Restart Vite after changing environment values. Start the Python backend separately with its default `PHOTO2SIM_PROVIDER=mock` to exercise real API jobs; these are still synthetic cube jobs. The mode banner and each job's provider/synthetic fields identify this.

Mock mode returns the same `JobRecord` shape and offers normal, provider-failure, and synthetic downstream-completion scenarios. Its mesh and XML are UI fixtures, not reconstructed or validated simulation outputs. It stores jobs in memory and resets on reload. The live backend currently stops at `awaiting_properties`: saving properties persists them but does not prepare geometry or export a scene. The UI only shows download links for paths actually present in a job response. A GLB viewer is deferred; OBJ/GLB downloads are available when produced.

Uploads use repeated multipart `images` fields and browser-generated Content-Type. The app polls running jobs at one-second intervals and stops on `awaiting_properties`, `failed`, or `completed`. Dimensions entered in millimetres and mass in grams are divided by 1000 before PATCHing metre/kilogram values. Empty friction is sent as `null`.
