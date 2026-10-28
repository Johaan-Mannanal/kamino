"""Local signed ACP exchanges; outbound delivery is replaced, never networked."""

import time
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("uagents_core")
from uagents_core.contrib.protocols.chat import (  # noqa: E402
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
)
from uagents_core.envelope import Envelope  # noqa: E402
from uagents_core.identity import Identity  # noqa: E402
from uagents_core.models import Model  # noqa: E402

from photo2sim.integrations.fetch_agent.app import create_app  # noqa: E402


class StubWorkflow:
    def __init__(self):
        self.calls = []

    async def run(self, text, resources):
        self.calls.append((text, resources))
        return "Synthetic workflow response"


def make_envelope(target, message):
    sender = Identity.from_seed("photo2sim-test-sender-not-a-live-agent", 0)
    envelope = Envelope(
        version=1,
        sender=sender.address,
        target=target,
        session=uuid4(),
        schema_digest=Model.build_schema_digest(type(message)),
        expires=int(time.time()) + 60,
    )
    envelope.encode_payload(message.model_dump_json())
    envelope.sign(sender)
    return envelope


def test_signed_chat_ack_reply_and_no_ack_loop():
    workflow, sent = StubWorkflow(), []
    app = create_app(
        workflow=workflow,
        send=lambda **payload: sent.append(payload),
        seed="photo2sim-test-agent-not-a-live-agent",
        allowed_senders={Identity.from_seed("photo2sim-test-sender-not-a-live-agent", 0).address},
    )
    with TestClient(app) as client:
        address = client.get("/status").json()["address"]
        message = ChatMessage(content=[TextContent(type="text", text="help")])
        envelope = make_envelope(address, message)
        response = client.post("/chat", json=envelope.model_dump(mode="json"))
        assert response.status_code == 200
        assert workflow.calls == [("help", [])]
        assert isinstance(sent[0]["msg"], ChatAcknowledgement)
        assert sent[0]["msg"].acknowledged_msg_id == message.msg_id
        assert sent[1]["msg"].text() == "Synthetic workflow response"
        assert sent[1]["session_id"] == envelope.session
        assert client.post("/chat", json=envelope.model_dump(mode="json")).status_code == 200
        assert workflow.calls == [("help", [])]
        assert len(sent) == 4
        acknowledgement = ChatAcknowledgement(acknowledged_msg_id=sent[1]["msg"].msg_id)
        acknowledgement_envelope = make_envelope(address, acknowledgement)
        assert (
            client.post("/chat", json=acknowledgement_envelope.model_dump(mode="json")).status_code
            == 200
        )
        assert len(sent) == 4


def test_unsigned_and_wrong_target_messages_cannot_execute_tools():
    workflow = StubWorkflow()
    app = create_app(workflow=workflow, send=lambda **_: None, seed="photo2sim-test-target")
    with TestClient(app) as client:
        address = client.get("/status").json()["address"]
        message = ChatMessage(content=[TextContent(type="text", text="upload")])
        envelope = make_envelope(address, message)
        envelope.signature = None
        assert client.post("/chat", json=envelope.model_dump(mode="json")).status_code == 401
        wrong_target = make_envelope("agent-wrong-target", message)
        assert client.post("/chat", json=wrong_target.model_dump(mode="json")).status_code == 401
        assert workflow.calls == []


def test_valid_signed_sender_is_denied_by_default_before_any_reply(monkeypatch):
    monkeypatch.delenv("PHOTO2SIM_AGENT_ALLOWED_SENDERS", raising=False)
    workflow, sent = StubWorkflow(), []
    app = create_app(
        workflow=workflow,
        send=lambda **payload: sent.append(payload),
        seed="photo2sim-test-private-adapter",
    )
    with TestClient(app) as client:
        target = client.get("/status").json()["address"]
        message = ChatMessage(content=[TextContent(type="text", text="upload")])
        envelope = make_envelope(target, message)
        result = client.post("/chat", json=envelope.model_dump(mode="json"))
        assert result.status_code == 403
        assert workflow.calls == []
        assert sent == []


def test_explicit_allowlist_rejects_other_signed_sender_and_env_allows_operator(monkeypatch):
    sender = Identity.from_seed("photo2sim-test-sender-not-a-live-agent", 0).address
    workflow, sent = StubWorkflow(), []
    monkeypatch.setenv("PHOTO2SIM_AGENT_ALLOWED_SENDERS", "  " + sender + "  ")
    app = create_app(
        workflow=workflow,
        send=lambda **payload: sent.append(payload),
        seed="photo2sim-test-allowed-adapter",
    )
    with TestClient(app) as client:
        target = client.get("/status").json()["address"]
        message = ChatMessage(content=[TextContent(type="text", text="help")])
        envelope = make_envelope(target, message)
        assert client.post("/chat", json=envelope.model_dump(mode="json")).status_code == 200
        assert workflow.calls == [("help", [])]
    rejected = create_app(
        workflow=workflow,
        send=lambda **payload: sent.append(payload),
        seed="photo2sim-test-other-adapter",
        allowed_senders={"agent-unrelated"},
    )
    with TestClient(rejected) as client:
        target = client.get("/status").json()["address"]
        envelope = make_envelope(target, message)
        before = len(sent)
        assert client.post("/chat", json=envelope.model_dump(mode="json")).status_code == 403
        assert len(sent) == before
        assert workflow.calls == [("help", [])]
