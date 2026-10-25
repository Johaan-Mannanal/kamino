# Local and hosted configuration

Copy `.env.example` to `.env` only if you do not already have one. The normal
backend reads the launch-directory `.env`; exported variables take precedence.
The isolated `python -m tools.run_demo` launcher ignores it and makes no provider
calls. Keep robot/LeRobot and simulation Python environments separate.

## Backend configuration

| Variable | Purpose |
| --- | --- |
| `PHOTO2SIM_PROVIDER` | `mock` by default; `meshy` enables paid reconstruction |
| `PHOTO2SIM_DATA_DIR` | Persistent job database and artifacts; one server/worker per data directory |
| `PHOTO2SIM_API_TOKEN` | Private application credential; distinct from provider keys |
| `PHOTO2SIM_STUDENT_CODE`, `PHOTO2SIM_JUDGE_CODE`, `PHOTO2SIM_TEAM_CODE` | Optional hosted access tiers; do not commit real values |
| `PHOTO2SIM_PUBLIC_ORIGIN` | Exact public HTTPS frontend origin for hosted session configuration |
| `PHOTO2SIM_CORS_ORIGINS` | Comma-separated exact frontend origins; add port 5188 for the current UI |
| `MESHY_API_KEY`, `MESHY_MODEL` | Backend-only reconstruction credentials/model |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | Backend-only optional estimate service and configured model sequence |
| `GEMINI_MAX_ATTEMPTS`, `GEMINI_DEADLINE_SECONDS`, `GEMINI_BACKOFF_SECONDS` | Bounded estimate retries/deadline/backoff |

Model defaults are recorded in [.env.example](../.env.example); model availability
and quota depend on the provider/account. The adapter records actual-model and
fallback provenance and rejects late responses. Estimates do not establish
measurements. New-job friction may adopt an estimate while untouched; other
suggestions require explicit application, and saving remains deliberate.

## Start the normal local API

After installing the root package and configuring `.env`, from the repository root:

```sh
PHOTO2SIM_CORS_ORIGINS=http://127.0.0.1:5188,http://localhost:5188,http://127.0.0.1:5173,http://localhost:5173 \
  python -m uvicorn photo2sim.api.app:create_app --factory --host 127.0.0.1 --port 8000
```

PowerShell: set `$env:PHOTO2SIM_CORS_ORIGINS` to the same comma-separated origins,
then run the Python command. Start the frontend using the [root quickstart](../README.md).
Use `mock` for routine testing. Do not load real provider credentials into offline
acceptance runs or assume that merely reopening a live workspace is free of
estimate requests.

## Deployment

Production uses [Railway](../deploy/railway/README.md), persistent backend storage
and a frontend API proxy. Application sessions and provider quotas are separate.
Keep all credentials in private backend/deployment configuration; none belong in
frontend variables or URLs. Fetch/Agentverse and Vultr keys are not required by
the released application. Read [sponsor scope](SPONSORS.md) for actual integrations.
