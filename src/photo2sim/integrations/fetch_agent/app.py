"""Optional Agentverse ACP endpoint, kept outside the backend routes."""

import asyncio
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from photo2sim.integrations.fetch_agent.workflow import Workflow


def create_app(*, workflow=None, send=None, seed=None, allowed_senders=None) -> FastAPI:
    try:
        from uagents_core.contrib.protocols.chat import (
            ChatAcknowledgement,
            ChatMessage,
            ResourceContent,
            TextContent,
        )
        from uagents_core.envelope import Envelope
        from uagents_core.identity import Identity
        from uagents_core.models import Model
        from uagents_core.utils.messages import parse_envelope, send_message_to_agent
    except ImportError as error:
        raise RuntimeError("Install fetch_agent/requirements.txt for Agentverse ACP.") from error

    identity = Identity.from_seed(seed or os.environ["AGENT_SEED_PHRASE"], 0)
    configured = (
        os.getenv("PHOTO2SIM_AGENT_ALLOWED_SENDERS", "").split(",")
        if allowed_senders is None
        else allowed_senders
    )
    if isinstance(configured, str) or any(not isinstance(value, str) for value in configured):
        raise ValueError("Allowed senders must be an explicit collection of agent addresses")
    permitted = frozenset(value.strip() for value in configured if value.strip())
    owns_client = workflow is None
    workflow = workflow or Workflow(
        os.getenv("PHOTO2SIM_API_BASE_URL", "http://127.0.0.1:8000"),
        api_token=os.getenv("PHOTO2SIM_API_TOKEN", ""),
    )
    send = send or send_message_to_agent
    seen = {}

    @asynccontextmanager
    async def lifespan(app):
        yield
        if owns_client:
            await workflow.client.aclose()

    app = FastAPI(title="Kamino ASI:One adapter", lifespan=lifespan)

    @app.get("/status")
    async def status():
        return {"status": "ok", "agent": "photo2sim", "address": identity.address}

    @app.post("/chat")
    async def chat(envelope: Envelope):
        try:
            if envelope.target != identity.address or not envelope.verify():
                raise ValueError("Wrong target or invalid signature")
            if envelope.expires is not None and envelope.expires < time.time():
                raise ValueError("Expired envelope")
        except Exception:
            raise HTTPException(401, "Invalid or expired signed envelope") from None

        # A valid signature proves an identity, not permission to use our backend token.
        # Deny before acknowledgements, replay-cache access, outbound delivery or tool work.
        if envelope.sender not in permitted:
            raise HTTPException(403, "Agent sender is not authorized")

        if envelope.schema_digest == Model.build_schema_digest(ChatAcknowledgement):
            return {"status": "accepted"}
        if envelope.schema_digest != Model.build_schema_digest(ChatMessage):
            raise HTTPException(422, "Unsupported ACP message schema")
        try:
            message = parse_envelope(envelope, ChatMessage)
            if not isinstance(message, ChatMessage):
                raise ValueError("Invalid chat payload")
        except Exception:
            raise HTTPException(422, "Invalid ACP chat payload") from None

        async def reply(payload):
            await asyncio.to_thread(
                send,
                destination=envelope.sender,
                msg=payload,
                sender=identity,
                session_id=envelope.session,
            )

        key = (envelope.sender, str(message.msg_id))
        duplicate = key in seen
        cached = seen.get(key)
        if not duplicate:
            if len(seen) >= 1024:
                oldest = next((item for item, result in seen.items() if result is not None), None)
                if oldest is None:
                    raise HTTPException(503, "Agent is busy; retry later")
                del seen[oldest]
            seen[key] = None
        try:
            await reply(ChatAcknowledgement(acknowledged_msg_id=message.msg_id))
        except Exception:
            if not duplicate:
                del seen[key]
            raise HTTPException(503, "ACP acknowledgement delivery failed") from None
        if duplicate:
            if cached:
                await reply(ChatMessage(content=[TextContent(type="text", text=cached)]))
            return {"status": "accepted"}
        resources = []
        for item in message.content:
            if isinstance(item, ResourceContent):
                values = item.resource if isinstance(item.resource, list) else [item.resource]
                resources.extend(resource.uri for resource in values)
        try:
            result = await workflow.run(message.text(), resources)
        except Exception:
            result = "The workflow could not finish. Check the saved job status before retrying."
        seen[key] = result
        await reply(ChatMessage(content=[TextContent(type="text", text=result)]))
        return {"status": "accepted"}

    return app
