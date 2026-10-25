# Team environment setup

Copy `.env.example` to `.env` only if you do not already have a local file. Keep each machine's real `.env` local. The backend reads `.env` from its working directory without modifying the process environment; exported shell variables take precedence. Launch commands in README.md assume the repository root.

The template is shared; actual credentials are not committed. Each role needs only its services. A blank optional key does not block the mock backend or offline geometry/simulation work. Existing local configuration must not be overwritten when pulling updates.

| Variable | Where / who | Status |
| --- | --- | --- |
| `PHOTO2SIM_PROVIDER` | Backend; `mock` normally, explicitly `meshy` for real reconstruction | Implemented |
| `PHOTO2SIM_DATA_DIR` | Backend-local job files and SQLite database | Implemented |
| `PHOTO2SIM_API_TOKEN` | Optional local/private application access token; required in public Compose deployment | Implemented; sent by clients in Authorization header |
| `PHOTO2SIM_CORS_ORIGINS` | Comma-separated exact allowed frontend origins | Implemented; defaults to localhost:5173 and 127.0.0.1:5173 |
| `MESHY_API_KEY` | Meshy Developer Platform → API Keys; backend machine only | Implemented |
| `MESHY_MODEL` | `meshy-6` for the current geometry-only adapter | Implemented |
| `GEMINI_API_KEY` | Google AI Studio project key; property-assistance service | Implemented by explicit cached suggestions API; never confirms properties automatically |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Real charger suggestion request succeeded through the API on Johaan's key; ongoing quota is account-dependent |
| `GEMINI_FALLBACK_MODELS` | `gemini-3.6-flash` | Comma-separated fallback model IDs; set empty to disable |
| `GEMINI_MAX_ATTEMPTS` | `2` | Maximum attempts per eligible model |
| `GEMINI_DEADLINE_SECONDS` | `75` | Total deadline across retries and models |
| `GEMINI_BACKOFF_SECONDS` | `0.5` | Initial exponential retry delay |
| `AGENTVERSE_API_KEY` | Agentverse account registration/access key; Atul's agent machine | Reserved; agent adapter not implemented on this branch |
| `FETCH_AGENT_SEED` | One locally generated, persistent private seed deriving the agent identity | Reserved; Atul must wire it into the adapter |
| `FETCH_AGENT_ENDPOINT` | Public HTTPS message endpoint for the deployed ACP agent | Reserved; fill after deployment, not a guessed URL |
| `PHOTO2SIM_API_BASE_URL` | Backend URL reached by the agent; localhost for same-machine development | Reserved for the agent; other laptops need a reachable backend URL or their own local backend |
| `VULTR_API_KEY` | Vultr account API key, only if automating infrastructure | Reserved for deployment tooling; the application does not need it to run on a Vultr server |

## Gemini

The API and standalone adapter share the same `gemini-3.8-flash` default, followed by `gemini-3.6-flash`. Both appear in [Google's model catalog](https://ai.google.dev/gemini-api/docs/models). Transient network, rate-limit and server failures use bounded retries before switching models. Authentication, billing, permissions, daily quota and invalid requests stop immediately. Malformed or blocked output also stops without fallback. The response remains unverified and does not change confirmed properties. The cache records the actual `modelVersion` when provided by Gemini, the requested model and whether fallback was used. Provider errors remain sanitized; credentials are sent only in the request header.

The elapsed deadline starts before adapter input preparation and is enforced while
waiting for each synchronous HTTP request, independently of HTTPX's per-phase socket
timeouts. Each model receives an equal share of the remaining time; each attempt
receives a share of that model's budget. A timed-out attempt skips further retries
on that model so a slow primary leaves time for fallback. Late successes are discarded,
including responses that exceed the total budget during validation, and cannot update
the suggestion cache. A synchronous request already in progress may finish in a daemon
worker after its caller stops waiting. At most four such request workers can exist
process-wide; occupied capacity returns a safe `busy` category instead of adding workers.

## Fetch / Atul

1. Sign in to Agentverse and create an API key using its account settings.
2. Generate one seed on the machine that will run the agent, store it privately as `FETCH_AGENT_SEED`, and keep it stable across restarts. Do not start multiple simultaneous copies of the same agent identity.
3. Wire these planned names into the adapter, implement ACP, and connect it to the existing backend workflow. They are app-chosen names, not automatic SDK configuration.
4. Once deployed, fill the real public endpoint, register the agent, and verify an ASI:One conversation. Adding keys alone does not complete registration or qualify the sponsor integration.

[Official local-uAgent onboarding requirements](https://docs.agentverse.ai/documentation/launch-agents/agentverse-sdk/u-agents) include an ACP-compatible live agent, API key, seed, and public endpoint. Atul may adapt this template if his implementation uses another documented hosting approach; coordinate names first.

## Vultr / Johaan

Activate the event's Vultr offer and verify the resulting account credits/terms. Choose infrastructure once the pipeline is ready for deployment. An API key is needed for automated provisioning; manual console deployment does not require putting one in the app's `.env`. If automation is used, create the key and configure API access through [Vultr's account API controls](https://docs.vultr.com/platform/other/api).

Application keys such as Meshy/Gemini belong in the deployed backend environment. `VULTR_API_KEY` belongs only with the deployment operator/tools. The Python simulation requires no cloud key for local testing. See [deployment instructions](../deploy/README.md) for the Docker/HTTPS package and acceptance checks. `.env.deploy` is private deployment configuration; it is not the frontend configuration.

## By laptop

- Johaan: Meshy and Gemini credentials, plus deployment credentials later if automating Vultr.
- Srijan: Gemini only if testing the optional assistant; deterministic geometry can run without keys.
- Yash: no external key required for exporter/validator tests.
- Atul: frontend work can use mocks/local API; Fetch credentials are needed when implementing/registering the agent. Browser code receives no private API keys.
