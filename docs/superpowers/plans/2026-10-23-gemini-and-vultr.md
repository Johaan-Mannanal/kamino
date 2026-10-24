# Gemini assistance and Vultr deployment

> **For agentic workers:** Use superpowers:executing-plans for inline implementation, test-first checks, and a final independent review.

**Goal:** Expose optional Gemini property suggestions, prove a real request, and deploy the backend on Vultr.

**Architecture:** An explicit job suggestions endpoint calls the existing Gemini adapter, with cached results separate from confirmed properties. A deployment-only bearer token protects costly API operations; configurable CORS supports the frontend. Package the full backend in Docker with persistent storage and a Caddy HTTPS proxy.

**Tech Stack:** Existing FastAPI/Pydantic/httpx/Pillow adapter; Docker Compose, Caddy, Vultr CPU instance.

**Spec:** Existing `docs/PROJECT.md`, `docs/API.md`, and the user's explicit request to connect Gemini, test a real request, and deploy on Vultr.

## Global constraints

- Continue on the established backend feature branch; preserve teammate branches, credentials and cached real assets.
- Suggestions stay labelled estimated and never automatically overwrite confirmed properties or launch processing.
- Calls are explicit, cached, bounded, and optional; failures leave manual entry available.
- Provider keys remain server-side. Production API access requires a separate application bearer token, not a Meshy/Gemini key.
- One server worker and a persistent jobs volume. HTTPS at the public proxy; the backend's port is internal.
- Verify account access and the actual instance price before provisioning; credentials/sign-in and any required final financial confirmation remain user-controlled.

## Review focus

- Repeat/concurrent requests must not create duplicate Gemini calls or leak credentials.
- Missing keys, quotas, malformed responses and local image failures must not mutate confirmed properties.
- Photos must remain local originals; Gemini gets bounded JPEG copies from inside the requested job directory.
- Public unauthenticated requests must not reach costly endpoints; health and CORS preflight remain usable.
- Container deployment must preserve jobs across restarts and must not embed local secrets or publish port 8000.

### Task 1: Suggestions API

Files: new `src/photo2sim/api/suggestions.py`, `src/photo2sim/api/app.py`, new `tests/test_suggestions_api.py`.

Interface: `POST /api/jobs/{id}/suggestions` with optional `{object_hint, refresh}` returns existing `PropertySuggestions`. `GET` returns cached suggestions or 404. Persist model, hint, timestamp and suggestions separately from `JobRecord.properties`. A repeated POST with the same model/hint uses cache; refresh is explicit. Bound inference concurrency to one request; busy calls return 429, unavailable assistance returns 503.

- [x] Write and observe failing route tests for provenance/manual-confirmation separation, caching, missing key/provider errors, path containment, original preservation and concurrent requests.
- [x] Implement the endpoints, image copies and cache with the existing adapter.
- [x] Test one real request using the saved charger photos and configured model, preserving sanitized evidence.

### Task 2: Deployable backend

Files: `api/config.py`, `api/app.py`, `tests/test_config.py`, new `tests/test_access.py`, `.env.example`, `Dockerfile`, `.dockerignore`, `compose.yaml`, `deploy/Caddyfile`, deployment instructions and smoke command, CI.

- [x] Write failing auth/CORS tests, then implement optional local bearer protection and configurable origins.
- [x] Package a non-root Python 3.12 backend with the simulation extra, persistent jobs and HTTPS proxy; exclude credentials from build context. Add a mock-only HTTP smoke command and CI container verification.
- [ ] Run full tests/lint/format/dependency checks and independent review; publish the feature branch.
- [ ] Provision/deploy through available Vultr access, verify HTTPS/auth/health and a complete mock simulation. Activate configured real providers without another paid reconstruction smoke request.

## Execution ledger

- Start: clean backend branch at `43ad99e`; prior combined suite 158 passed.
- Credential-presence check: Gemini, Meshy and Agentverse configured; Vultr API key absent. Accessible Vultr browser requires sign-in; user handoff requested while independent coding continues.
- The plan reuses the current backend checkout as continuation of the established team task.

- Task 1: Gemini route tests failed before implementation, then passed. One real request returned HTTP 200 and estimated dimensions/mass, unknown friction and questions. Confirmed properties and entire JobRecord stayed unchanged.
- Task 2: auth/CORS and smoke regressions failed before implementation, then passed. Full local suite 172 passed; Ruff/dependency/diff checks passed. Independent reviewer ran focused tests with no material findings.
- Cache race: reproduced stale cache read followed by late inference-slot acquisition producing two calls; recheck inside the slot now prevents it.
- Deployment access is still pending: no Vultr API key and accessible console is signed out. Private deployment configuration is prepared; Linux container acceptance will run in CI after push.
