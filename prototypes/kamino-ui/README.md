# Kamino web application

This directory contains the **released website**, despite its historical
`prototypes` path. It imports shared API, sizing and viewer modules from `frontend`.
See the [root README](../../README.md) for product scope, setup and sponsor evidence.

## Install and run

Node.js 22.12+ and pnpm 11.25.0 are required. From the repository root:

```sh
pnpm --dir frontend install --frozen-lockfile
pnpm --dir prototypes/kamino-ui install --frozen-lockfile
pnpm --dir prototypes/kamino-ui dev
```

Open http://127.0.0.1:5188. The default API is http://127.0.0.1:8000.
For a no-provider backend, run `python -m tools.run_demo --frontend-port 5188`
from the repository root and enter the temporary token it prints.

| Build variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | Backend URL |
| `VITE_KAMINO_ASSEMBLY_URL` | `http://127.0.0.1:5173/assembly.html` | Separate assembly workbench |

Set these in the shell or `.env.local` before starting Vite/building. Never put
provider keys or access codes in build variables. Hosted sessions use the API's
secure cookie; local application-token mode remains supported.

## Current behavior

Home → Upload → Creating mesh → Workspace → Save & generate → Download.
The actual backend determines processing status. Whole reconstructed geometry,
source photos, Studio/Mesh display and camera controls remain available. One
reviewed reference scales all axes uniformly. Gemini notes and estimates retain
provenance; untouched new-job friction defaults may be estimated automatically.
Manual edits, saved unknowns and prior downloads remain protected.

The separate **Use demo photos** route is synthetic. Its state is session-only,
its example values are not measurements, and its download is not a validated
server simulation bundle. [Original handoff](HANDOFF.md) is historical, not a
list of integration work still required.

## Verify

```sh
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir prototypes/kamino-ui test
pnpm --dir prototypes/kamino-ui build
```

[Release evidence](../../docs/RELEASE.md) distinguishes automated tests, local
browser emulation, hosted checks and physical limitations. Browser harnesses under
`scripts/` are scoped fixtures, not proof of live-provider or physical accuracy.
