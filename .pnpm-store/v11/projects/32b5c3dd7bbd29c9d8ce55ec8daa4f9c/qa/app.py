"""Local browser QA only: GLB fixture, test bearer token, controlled Gemini transport."""

import json
import os
import shutil
import time
from dataclasses import replace
from pathlib import Path

import httpx

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings
from photo2sim.integrations.reconstruction import MockProvider

ROOT = Path(__file__).resolve().parents[2]


class GlbFixtureProvider(MockProvider):
    def download(self, snapshot, output_dir):
        output_dir.mkdir(parents=True, exist_ok=True)
        output = output_dir / "mesh.glb"
        shutil.copyfile(ROOT / "examples/assets/synthetic_box.glb", output)
        return output


def gemini_transport(request):
    prompt = json.loads(request.content)["contents"][0]["parts"][0]["text"].lower()
    if "unavailable" in prompt:
        return httpx.Response(503, json={"error": "Synthetic provider unavailable"})
    if "slow" in prompt:
        time.sleep(8)
    result = {
        "dimensions_m": {"x": 0.04, "y": 0.05, "z": 0.06},
        "mass_kg": 0.08,
        "sliding_friction": None,
        "clarifying_questions": [
            "What are the measured full extents?",
            "What is the measured mass?",
        ],
        "notes": ["Local browser QA mock. Gemini was not called."],
    }
    return httpx.Response(
        200, json={"candidates": [{"finishReason":"STOP", "content": {"parts": [{"text": json.dumps(result)}]}}]}
    )


def create_qa_app():
    base = Settings.from_env()
    live = os.getenv("PHOTO2SIM_QA_GEMINI") == "live"
    settings = replace(
        base,
        provider="mock",
        data_dir=ROOT / "artifacts/frontend-glb-qa",
        api_token=os.getenv("PHOTO2SIM_QA_TOKEN", "local-ui-test-token"),
        gemini_api_key=base.gemini_api_key if live else "synthetic-qa-key",
    )
    return create_app(
        settings, GlbFixtureProvider(), gemini_transport=None if live else gemini_transport
    )
