# Railway test deployment

Build from the repository root with the two Dockerfiles here. This branch packages checkpoint 724867c; it does not include the pending can-selection or Figma changes.

| Service | Dockerfile | Variables | Exposure |
|---|---|---|---|
| kamino-api | deploy/railway/backend.Dockerfile | PORT=8000, PHOTO2SIM_PROVIDER=mock, PHOTO2SIM_DATA_DIR=/data/jobs, private PHOTO2SIM_API_TOKEN | Private only |
| kamino-app | deploy/railway/frontend.Dockerfile | PORT=8080, API_UPSTREAM=kamino-api.railway.internal:8000 | Railway HTTPS |

Set RAILWAY_DOCKERFILE_PATH separately on each service. Attach a volume at /data to the backend, one replica/worker. Backend binds IPv4 0.0.0.0 for Railway healthchecks and its IPv4 private network. Backend healthcheck: /api/health. Frontend healthcheck: /. Start with backend 1 CPU/2 GB and frontend 1 CPU/0.5 GB. These are resource ceilings, not billing caps.

The frontend build uses VITE_API_MODE=live and VITE_API_BASE_URL=/ and both Vite entries. The 220 MB proxy body ceiling accommodates the API's 200 MiB aggregate mesh limit plus multipart metadata. Caddy preserves /api paths and bearer headers. Missing files return 404; there is no catch-all HTML rewrite for API errors. HTTPS terminates at Railway. No provider key or application token is compiled into JavaScript. The backend entrypoint requires an application token and drops root privileges after preparing the volume directory.

The pnpm v9-format lockfile was installed with pnpm 10.15.1, explicitly disabling package-manager version switching. Product package metadata remains unchanged for the UI owner.

## Verification

Local build passed. Caddy 2.11.7 validated the configuration; a local Caddy/backend test passed both pages, API authorization, synthetic upload/process/ZIP download and backend-restart persistence. Docker is unavailable on the Mac; local proxy checks do not establish container acceptance. Railway build/runtime results must be recorded separately.

Run tools/deployment/smoke.py with --mock and a private env file against the HTTPS host. The script refuses a real reconstruction provider. Never upload .env files or historical private captures for this infrastructure test. For CLI uploads use a clean archive of the committed tree so untracked data/dependencies cannot leak into the build context.

First-test authorization is up to $10 additional usage only. Stop test workloads after acceptance unless continued hosting is agreed. Keep the persistent volume for evidence. Domain setup uses the exact Railway-generated DNS records after the public host passes checks. Later integrated source requires a new deployment and acceptance; Srijan's Windows results remain separate.
