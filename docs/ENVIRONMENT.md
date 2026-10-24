# Team environment setup

Copy `.env.example` to `.env` only if you do not already have a local file. Keep each machine's real `.env` local. The backend reads `.env` from its working directory without modifying the process environment; exported shell variables take precedence. Launch commands in README.md assume the repository root.

The template is shared; actual credentials are not committed. Each role needs only its services. A blank optional key does not block the mock backend or offline geometry/simulation work. Existing local configuration must not be overwritten when pulling updates.

| Variable | Where / who | Status |
| --- | --- | --- |
| `PHOTO2SIM_PROVIDER` | Backend; `mock` normally, explicitly `meshy` for real reconstruction | Implemented |
| `PHOTO2SIM_DATA_DIR` | Backend-local job files and SQLite database | Implemented |
| `MESHY_API_KEY` | Meshy Developer Platform → API Keys; backend machine only | Implemented |
| `MESHY_MODEL` | `meshy-6` for the current geometry-only adapter | Implemented |
| `GEMINI_API_KEY` | Google AI Studio project key; property-assistance service | Read by shared settings; assistant integration is separate |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Stable model ID verified in Google docs and available to Johaan's key; generation/quota not established by model-list access |
| `AGENTVERSE_API_KEY` | Agentverse account registration/access key; Atul's agent machine | Reserved; agent adapter not implemented on this branch |
| `FETCH_AGENT_SEED` | One locally generated, persistent private seed deriving the agent identity | Reserved; Atul must wire it into the adapter |
| `FETCH_AGENT_ENDPOINT` | Public HTTPS message endpoint for the deployed ACP agent | Reserved; fill after deployment, not a guessed URL |
| `PHOTO2SIM_API_BASE_URL` | Backend URL reached by the agent; localhost for same-machine development | Reserved for the agent; other laptops need a reachable backend URL or their own local backend |
| `VULTR_API_KEY` | Vultr account API key, only if automating infrastructure | Reserved for deployment tooling; the application does not need it to run on a Vultr server |

## Gemini

Set `GEMINI_MODEL=gemini-3.8-flash`. This model is listed as stable in [Google's model catalog](https://ai.google.dev/gemini-api/docs/models.md) and appeared in the current key's model-list response. The key authenticated successfully. A model listing does not verify inference quota or the unfinished property-assistance implementation.

## Fetch / Atul

1. Sign in to Agentverse and create an API key using its account settings.
2. Generate one seed on the machine that will run the agent, store it privately as `FETCH_AGENT_SEED`, and keep it stable across restarts. Do not start multiple simultaneous copies of the same agent identity.
3. Wire these planned names into the adapter, implement ACP, and connect it to the existing backend workflow. They are app-chosen names, not automatic SDK configuration.
4. Once deployed, fill the real public endpoint, register the agent, and verify an ASI:One conversation. Adding keys alone does not complete registration or qualify the sponsor integration.

[Official local-uAgent onboarding requirements](https://docs.agentverse.ai/documentation/launch-agents/agentverse-sdk/u-agents) include an ACP-compatible live agent, API key, seed, and public endpoint. Atul may adapt this template if his implementation uses another documented hosting approach; coordinate names first.

## Vultr / Johaan

Activate the event's Vultr offer and verify the resulting account credits/terms. Choose infrastructure once the pipeline is ready for deployment. An API key is needed for automated provisioning; manual console deployment does not require putting one in the app's `.env`. If automation is used, create the key and configure API access through [Vultr's account API controls](https://docs.vultr.com/platform/other/api).

Application keys such as Meshy/Gemini belong in the deployed backend environment. `VULTR_API_KEY` belongs only with the deployment operator/tools. The Python simulation requires no cloud key for local testing.

## By laptop

- Johaan: Meshy and Gemini credentials, plus deployment credentials later if automating Vultr.
- Srijan: Gemini only if testing the optional assistant; deterministic geometry can run without keys.
- Yash: no external key required for exporter/validator tests.
- Atul: frontend work can use mocks/local API; Fetch credentials are needed when implementing/registering the agent. Browser code receives no private API keys.
