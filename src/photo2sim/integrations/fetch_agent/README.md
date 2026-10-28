# Fetch / ASI:One adapter (experimental)

This separate experimental ACP service calls the existing Kamino HTTP API for upload, status, property confirmation, processing and artifact discovery. Geometry and reconstruction remain in the backend. It is locally tested, not registered or demonstrated through ASI:One.

Install the root project in a Python 3.12 environment, then install the optional official dependency separately. Keep `AGENT_SEED_PHRASE` secret and stable. Set `PHOTO2SIM_API_BASE_URL` to the backend origin and, for a protected backend, `PHOTO2SIM_API_TOKEN` server-side. Set `PHOTO2SIM_AGENT_ALLOWED_SENDERS` to a comma-separated list of exact trusted operator agent addresses. Missing or empty configuration denies every chat sender. Run:

```powershell
python -m pip install -r src/photo2sim/integrations/fetch_agent/requirements.txt
python -m uvicorn photo2sim.integrations.fetch_agent.app:create_app --factory --host 127.0.0.1 --port 8001
python -m pytest tests/test_fetch_agent.py tests/test_fetch_agent_acp.py -q
```

`GET /status` and `POST /chat` follow Fetch's [FastAPI ACP guide](https://innovationlab.fetch.ai/resources/docs/next/agentverse/agentverse-sdk-fastapi). Chat commands are `help`, `upload` with 1–4 JPEG/PNG/WebP **base64 data URI** ACP resources, `status <job UUID>`, `confirm <job UUID> <AssetProperties JSON>`, `process <job UUID>`, and `files <job UUID>`. Property JSON is the exact payload from `docs/API.md`; values use metres/kilograms and source labels. Processing is a separate explicit command. Status and files preserve synthetic/provider labels, and ZIP links require a completed job.

The adapter verifies envelope signatures, target and expiry, then checks the configured sender allowlist before acknowledging, consulting the replay cache, replying or invoking backend tools. A valid signature alone is not authorization. Allowed operators share the configured backend authority, including administrative access to known jobs when the application token is used. This is not a public multi-user service; that requires separate per-sender backend delegation and ownership. For allowed senders it acknowledges incoming chat, replies once, accepts acknowledgements without loops, and avoids repeated tool execution for duplicate message IDs in a bounded in-memory cache. Deduplication does not survive a service restart. Local tests use real signed ACP envelopes and replace outbound delivery. No external messages are sent by those tests. The tested package is uagents-core 0.4.12 with AgentChatProtocol 0.3.0.

The backend performs image and property validation. The adapter limits image size and never fetches arbitrary external image URLs. Actual ASI:One attachments still need a compatibility test: ACP permits resource URIs but does not promise data URIs. Protected artifact URLs require an authenticated attachment delivery mechanism before the complete chat-only workflow can be demonstrated. The current adapter returns links and never discloses the application token.

Before registration, expose a stable HTTPS `/chat` endpoint and supply the Agentverse-generated registration script with the same seed and API key. Add accurate discovery keywords and test an actual ASI:One conversation. No Agentverse registration, live ACP delivery, or sponsor qualification is claimed here. Current requirements: [FastAPI Agentverse registration](https://innovationlab.fetch.ai/resources/docs/next/agentverse/agentverse-sdk-fastapi), [ACP v0.3.0](https://innovationlab.fetch.ai/resources/docs/agent-communication/agent-chat-protocol).

Checked against the official [CalHacks sponsor pack](https://www.fetch.ai/events/hackathons/calhacks-13-0/hackpack) on October 23, 2026: registration, ACP, discoverability and complete primary workflow inside ASI:One are mandatory. Submission also needs a public repository, agent name/address and Innovation Lab/hackathon badges in the agent profile README, a 3–5 minute video, Devpost, and the ASI:One submission agent. Add the actual registered address and badges to the public profile once registration is verified.
