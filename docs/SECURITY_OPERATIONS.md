# Security and operations

## Browser edge

The self-hosted Caddy site and Railway's public Caddy listener return a common
browser policy: a same-origin-only default CSP, `frame-ancestors 'none'` plus
`X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, and disabled
microphone/geolocation permissions. `camera=(self)` leaves same-origin camera
use available. The CSP permits the app's same-origin scripts and API, inline
styles already emitted by the UI, and the `blob:`/`data:` image and mesh preview
resources used by the Three.js interfaces. It deliberately does not set COEP or
COOP: those can break browser integrations and were not validated here.
The self-hosted backend's generated `/docs`, `/redoc` and `/docs/oauth2-redirect`
pages retain their existing CDN scripts/inline initialization and omit CSP;
the other security headers still apply. The strict policy covers application/API
responses. Railway's static frontend keeps CSP on every response.

Self-hosted Caddy obtains TLS for `PHOTO2SIM_PUBLIC_HOST` and sends HSTS only
from that HTTPS site. Railway terminates TLS before its internal Caddy listener;
the public Railway route must therefore be HTTPS before HSTS is meaningful.
The frontend uses same-origin `/api`; set the backend's
`PHOTO2SIM_PUBLIC_ORIGIN` to that exact HTTPS frontend origin (including a
non-default port if used), and set `KAMINO_PUBLIC_ORIGIN` to the same origin at
frontend build time. Do not use a broad wildcard or an unrelated Railway URL.
Compose derives `PHOTO2SIM_PUBLIC_ORIGIN` from its required public DNS host so
reverse-proxied sessions set Secure cookies and pass exact-Origin checks. Both
public proxies accept 70 MB; the backend applies stricter route-specific caps.

## Data, recovery, and retention

Job records, source inputs, prepared files, ZIPs, access-usage data, and SQLite
state live under `PHOTO2SIM_DATA_DIR` (the Compose `jobs` volume is `/data`).
They are retained until an operator performs an intentional, reviewed cleanup;
admission/quota failures fail closed and do not delete existing jobs or inputs.
The software does not provide a retention scheduler or a deletion guarantee.

Back up a stopped or application-consistent copy of the whole data directory and
record the source commit and restore test. Keep backups encrypted and access
controlled. Never publish job volumes, SQLite files, environment files, build
logs containing environment values, provider credentials, or access codes.
Before a schema or image change, make a fresh backup and prove a restore into an
isolated directory using the same application version. A rollback reuses the
previous verified image and the preserved volume; do not run `docker compose
down --volumes` during ordinary recovery.

## Capacity and incident response

Monitor free disk space and inode use for the data volume, SQLite growth and
lock errors, queued/running job age, worker failures/restarts, API 5xx rate, and
proxy request-body rejections. Alert before disk exhaustion and when queue age
or failed jobs grows beyond the service team's operating threshold. Pause new
admissions or scale/recover workers before considering deletion; preserve the
failing data and logs needed for diagnosis.

The Linux production image is constrained to the Python 3.12 resolution in
`requirements/production-py312.txt`, captured from accepted CI run
40560850077. It is not a cross-platform lock and should be regenerated from a
verified Linux CI run when dependencies intentionally change. The parser and
simulation process run in one container worker; provision memory for the largest
accepted image/mesh and expected MuJoCo parsing workload, and treat OOM kills or
persistent queue growth as operational incidents rather than retrying blindly.

Retained-byte admission is not an operating-system filesystem quota. Native
simulation scratch is created privately inside its job directory before publication
and is included in usage scans without being counted twice when published.
SQLite metadata and temporary files still need additional physical headroom. Configure
container memory/CPU limits and an appropriately sized volume, monitor actual
usage, and stop admissions before the physical reserve is exhausted. The import
subprocess has time/byte/concurrency bounds and Linux resource limits; it is not
a separate UID, seccomp policy or filesystem sandbox. Windows/Mac do not receive
the Linux address-space/CPU rlimits. Do not run multiple backend replicas against
one data directory: the supported launchers use one Uvicorn worker and assembly
job claims use a process-local lock.

The optional Agentverse adapter is separate from the website deployment. Keep it
on loopback unless intentionally exposing it behind an authenticated, bounded
edge. `PHOTO2SIM_AGENT_ALLOWED_SENDERS` must list exact trusted operator addresses;
empty means deny all. Allowed senders share the adapter's configured backend
authority. A public agent service needs per-sender authorization/delegation rather
than this administrative adapter.
