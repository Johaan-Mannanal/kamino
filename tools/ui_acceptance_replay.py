"""Opt-in LOCAL acceptance adapters. Never imported by the production server.

Gemini responses use the real parser/error adapter but never an HTTP connection.
Processing faults occur inside the real pipeline, scoped to one job and once per
launcher run. Existing processing, persistence, history and retry stay unchanged.
"""

import json
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock, local
from unittest.mock import patch

import httpx

from photo2sim.integrations.reconstruction import MockProvider, ProviderSnapshot

GEMINI_SCENARIOS = ("positive", "unknown", "malformed", "truncated", "quota", "overload")


class OfflineReplay:
    def __init__(
        self,
        data_dir,
        *,
        gemini=None,
        processing_job=None,
        stage="validation",
        reconstruction=False,
    ):
        if gemini is not None and gemini not in GEMINI_SCENARIOS:
            raise ValueError("Unknown offline Gemini fixture")
        if stage not in ("preparation", "validation"):
            raise ValueError("Unknown offline processing stage")
        self.root = Path(data_dir).resolve()
        self.gemini = gemini
        self.processing_job = str(processing_job) if processing_job else None
        self.stage = stage
        self.reconstruction = reconstruction
        self.consumed = False
        self.events = []
        self.lock = Lock()

    def record(self, kind, **fields):
        event = {
            "at": datetime.now(UTC).isoformat(),
            "kind": kind,
            "offline_fixture": True,
            **fields,
        }
        with self.lock:
            self.events.append(event)
            self.root.mkdir(parents=True, exist_ok=True)
            with (self.root / "offline-replay.jsonl").open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(event) + "\n")

    def transport(self, request):
        # Never log image bodies, headers, keys or provider URLs.
        self.record("gemini_response", scenario=self.gemini)
        if self.gemini == "quota":
            return httpx.Response(429, json={"error": {"status": "QUOTA_EXCEEDED"}})
        if self.gemini == "overload":
            return httpx.Response(503, json={"error": {"status": "UNAVAILABLE"}})
        if self.gemini == "malformed":
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {
                            "finishReason": "STOP",
                            "content": {"parts": [{"text": "{invalid fixture json"}]},
                        }
                    ]
                },
            )
        data = {
            "dimensions_m": {"x": 0.04, "y": 0.05, "z": 0.06},
            "mass_kg": 0.08,
            "sliding_friction": 0.4,
            "clarifying_questions": ["Which full extent is the reviewed reference?"],
            "notes": ["Offline synthetic UI fixture; not an object measurement."],
        }
        if self.gemini == "unknown":
            data.update(dimensions_m=None, mass_kg=None, sliding_friction=None)
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "finishReason": "MAX_TOKENS" if self.gemini == "truncated" else "STOP",
                        "content": {"parts": [{"text": json.dumps(data)}]},
                    }
                ]
            },
        )

    def consume(self, path, stage):
        try:
            ident = Path(path).resolve().relative_to(self.root).parts[0]
        except (ValueError, IndexError):
            return False
        return self.consume_identity(ident, stage)

    def consume_identity(self, ident, stage):
        with self.lock:
            if self.consumed or ident != self.processing_job or stage != self.stage:
                return False
            self.consumed = True
        self.record("processing_failure", job_id=ident, stage=stage)
        return True

    @contextmanager
    def pipeline_hooks(self):
        if self.processing_job is None:
            yield
            return
        from photo2sim.api import pipeline

        original_prepare, original_validate = pipeline.prepare_asset, pipeline.validate_export
        active = local()

        def prepare(source, *args, **kwargs):
            # Generated scenes now live in private scratch outside the retained job root.
            # Carry only the source's verified job identity in this worker thread.
            try:
                active.job_id = Path(source).resolve().relative_to(self.root).parts[0]
            except (ValueError, IndexError):
                active.job_id = None
            if self.consume(source, "preparation"):
                raise ValueError("Offline acceptance preparation failure")
            return original_prepare(source, *args, **kwargs)

        def validate(scene, *args, **kwargs):
            if self.consume_identity(getattr(active, "job_id", None), "validation"):
                return {
                    "passed": False,
                    "viewer_inspected": False,
                    "offline_acceptance_fixture": True,
                    "error": "Injected offline validation failure; not a physics result.",
                }
            return original_validate(scene, *args, **kwargs)

        with (
            patch.object(pipeline, "prepare_asset", prepare),
            patch.object(pipeline, "validate_export", validate),
        ):
            yield

    def provider(self):
        replay = self

        class ReplayProvider(MockProvider):
            def __init__(self):
                self.failed_tasks = set()
                self.armed = replay.reconstruction

            def submit(self, images):
                task = super().submit(images)
                with replay.lock:
                    if self.armed:
                        self.armed = False
                        self.failed_tasks.add(task)
                return task

            def poll(self, task_id):
                if task_id in self.failed_tasks:
                    replay.record("reconstruction_failure", synthetic_task=task_id)
                    return ProviderSnapshot(status="failed")
                return super().poll(task_id)

        return ReplayProvider()
