# Gemini API and deployment handoff

Branch: `codex/backend-pipeline`, building on the verified simulation integration at `43ad99e`.

## Gemini implemented and exercised

- `POST /api/jobs/{id}/suggestions` accepts optional `{object_hint, refresh}`; `GET` returns cached suggestions or 404.
- Requests use preserved job photos with separate EXIF-corrected RGB JPEG copies capped at 1024 pixels. Originals are not rewritten.
- Suggestions are cached by configured model and hint, in `suggestions/gemini.json`. Repeated requests use cache; refresh is explicit. One uncached request runs at a time; concurrent uncached requests get 429.
- Estimates remain `estimated`. The endpoint never updates confirmed properties, advances the job or launches simulation. Manual entry remains available on provider/key/quota failures (503), with invalid local inputs returning 422.
- Real `gemini-3.8-flash` request through the route succeeded with four saved charger photos. Returned estimates: 42 × 27 × 58 mm, 58 g, friction unknown; questions ask about contact surface and whether pins are included. The previous 43 × 27 × 58 mm / 59 g confirmed estimates and entire job record remained unchanged.
- Safe response example: `examples/api/apple-20w-gemini-suggestions.json`. The original runtime cache stays local and ignored. No new Meshy request was made.

## Public deployment package

Dockerfile: Python 3.12 with simulation dependencies, a non-root backend process and one worker. Compose: persistent jobs volume, required application access token, internal backend port, Caddy HTTPS proxy, persistent certificates, configurable CORS. Build context excludes local environment files and artifact directories; the image copies only package sources/metadata. Provider credentials are server-side only.

`PHOTO2SIM_API_TOKEN` enables Bearer protection for all `/api/` routes except health; blank keeps local development unchanged. OPTIONS preflight and docs/OpenAPI remain available. This is a private team-demo gate, not a multi-user identity system. It is distinct from provider keys and must not be embedded in a public frontend build. See [deployment instructions](../../deploy/README.md).

`tools/deployment/smoke.py` verifies access and, with `--mock`, the entire synthetic upload → properties → export/validation → ZIP workflow. It refuses a real provider before creating any job. Without `--mock` it checks only health/access. CI builds the container, validates Compose/Caddy, runs this smoke and checks persistence after restart.

## Atul / Fetch integration

Use the [API contract](../API.md). Add optional property suggestions by POSTing the existing job ID, display notes/questions and `estimated` provenance, and apply selected/edited values only with the existing properties PATCH. On 503 keep manual entry; on 429 allow retry after the supplied delay. GET retrieves saved suggestions without another provider call.

For a protected deployment, every job/suggestion/file request needs `Authorization: Bearer <private application token>`. File downloads must use authenticated fetch and a Blob download, or an authenticated server-side proxy. Plain unauthenticated anchor links will return 401. Keep provider keys out of the frontend. The Fetch agent must forward the same private application token when calling the backend; its Agentverse seed/identity remains separate.

## Verification and deployment state

Local suite: 172 passed, one upstream Starlette/httpx deprecation warning. New tests cover API caching/provenance/concurrency/error/path behavior, access/CORS and a real authenticated mock smoke. Ruff lint/format, dependency and diff checks pass. Independent review found no material actionable issues and ran focused tests; a cache-race regression was reproduced and fixed test-first. Local runtime: Python 3.13.7 / MuJoCo 3.3.7 (Intel Mac); Linux Python 3.12/container acceptance is checked separately by CI.

Actual Vultr deployment is **pending access**. The accessible browser remains at the sign-in screen and `VULTR_API_KEY` is absent. Account creation/credit redemption was reported by Johaan but no server, credit balance, plan price, SSH access, public hostname or live deployment has been verified here. A private ignored mode-600 `.env.deploy` has been prepared with selected provider keys and a separately generated application token; the public hostname remains blank. The sign-in/API-key handoff is pending; continue provisioning only once access and any necessary spending approval are available. A prepared container or green CI is not proof of a live Vultr service.
