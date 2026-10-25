"""Run isolated, offline UI acceptance against the existing application API.

Start: .venv-sim/Scripts/python tools/ui_acceptance_server.py
Seed a synthetic job's estimate cache in another terminal:
    .venv-sim/Scripts/python tools/ui_acceptance_server.py --seed-job UUID

This helper never calls Settings.from_env, reads .env, or loads provider keys.
Only loopback network connections are permitted in the server process. It adds
no application routes. Opt-in local replay flags simulate Gemini responses,
one processing failure for a named job, or one synthetic reconstruction failure.
They never contact real providers or modify original evidence.
Use python -m tools.ui_acceptance_fixture to import the pinned original can.
Invoke this module with python -m tools.ui_acceptance_server for fixture seeding.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import socket
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from photo2sim.api.app import create_app
from photo2sim.api.config import Settings
from photo2sim.api.store import JobStore
from photo2sim.api.suggestions import SuggestionService
from photo2sim.integrations.gemini import PropertySuggestions
from photo2sim.integrations.reconstruction import MockProvider

REPOSITORY = Path(__file__).resolve().parents[1]
ACCEPTANCE_ROOT = REPOSITORY / "outputs" / "ui-integration"
DEFAULT_DATA_DIR = ACCEPTANCE_ROOT / "data"


def isolated_data_dir(path: Path) -> Path:
    resolved = path.resolve()
    if not resolved.is_relative_to(ACCEPTANCE_ROOT.resolve()):
        raise ValueError("Acceptance data must remain under outputs/ui-integration")
    return resolved


def acceptance_settings(data_dir: Path, api_token: str) -> Settings:
    return Settings(
        data_dir=isolated_data_dir(data_dir),
        provider="mock",
        meshy_api_key="",
        gemini_api_key="",
        api_token=api_token,
        cors_origins=(
            "http://127.0.0.1:5188",
            "http://localhost:5188",
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ),
        poll_interval=0.05,
    )


def block_external_network(log_path: Path) -> None:
    """Deny outbound DNS/connections beyond loopback, retaining a local ledger."""
    original_lookup = socket.getaddrinfo
    original_connect = socket.socket.connect
    original_connect_ex = socket.socket.connect_ex

    def check(host: str | bytes | None) -> None:
        if host is None:
            return
        if isinstance(host, bytes):
            host = host.decode("ascii", errors="replace")
        if host.lower() == "localhost":
            return
        try:
            if ipaddress.ip_address(host).is_loopback:
                return
        except ValueError:
            pass
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as stream:
            stream.write(
                json.dumps({"at": datetime.now(UTC).isoformat(), "blocked_external_host": host})
                + "\n"
            )
        raise PermissionError("External network is disabled for UI acceptance")

    def lookup(host, *args, **kwargs):
        check(host)
        return original_lookup(host, *args, **kwargs)

    def connect(instance, address):
        if instance.family in {socket.AF_INET, socket.AF_INET6}:
            check(address[0])
        return original_connect(instance, address)

    def connect_ex(instance, address):
        if instance.family in {socket.AF_INET, socket.AF_INET6}:
            check(address[0])
        return original_connect_ex(instance, address)

    socket.getaddrinfo = lookup
    socket.socket.connect = connect
    socket.socket.connect_ex = connect_ex


def blocked_gemini_transport(*args, **kwargs):
    raise AssertionError("Gemini transport is forbidden during offline UI acceptance")


def build_app(
    data_dir: Path = DEFAULT_DATA_DIR,
    api_token: str = "ui-acceptance-only",
    *,
    gemini_replay=None,
    fail_processing_job=None,
    fail_processing_stage="validation",
    fail_next_reconstruction=False,
):
    settings = acceptance_settings(data_dir, api_token)
    replay = None
    if gemini_replay or fail_processing_job or fail_next_reconstruction:
        from tools.ui_acceptance_replay import OfflineReplay

        replay = OfflineReplay(
            settings.data_dir,
            gemini=gemini_replay,
            processing_job=fail_processing_job,
            stage=fail_processing_stage,
            reconstruction=fail_next_reconstruction,
        )
        if gemini_replay:
            settings = replace(
                settings,
                gemini_api_key="offline-fixture-not-a-provider-key",
                gemini_model="offline-synthetic-fixture",
                gemini_fallback_models=(),
                gemini_max_attempts=1,
                gemini_backoff_seconds=0,
            )
    block_external_network(settings.data_dir.parent / "blocked-network.jsonl")
    app = create_app(
        settings=settings,
        provider=replay.provider() if replay else MockProvider(),
        gemini_transport=replay.transport if gemini_replay else blocked_gemini_transport,
    )
    if replay:
        original_lifespan = app.router.lifespan_context

        @asynccontextmanager
        async def lifespan(application):
            with replay.pipeline_hooks():
                async with original_lifespan(application):
                    yield

        app.router.lifespan_context = lifespan
    app.state.ui_acceptance = {
        "offline": True,
        "synthetic": True,
        "provider_keys": False,
        "replay": replay,
    }
    return app


def seed_suggestions(
    settings: Settings, job_id: UUID, *, replace: bool = False, unknown: bool = False
) -> Path:
    from tools.ui_acceptance_fixture import is_original_can_fixture

    isolated_data_dir(settings.data_dir)
    store = JobStore(settings.data_dir)
    job = store.get(job_id)
    if not (job.synthetic and job.provider == "mock") and not is_original_can_fixture(store, job):
        raise ValueError(
            "Only an isolated synthetic job or verified original can fixture may be seeded"
        )
    suggestions = PropertySuggestions.model_validate(
        {
            "dimensions_m": {
                "x": 0.04,
                "y": 0.05,
                "z": 0.06,
                "source": "estimated",
                "note": "Saved synthetic UI fixture; not an object measurement",
            },
            "mass_kg": {
                "value": 0.08,
                "source": "estimated",
                "note": "Saved synthetic UI fixture; not a measured mass",
            },
            "sliding_friction": {
                "value": 0.4,
                "source": "estimated",
                "note": "Saved synthetic UI fixture; contact pair unverified",
            },
            "clarifying_questions": ["Which full extent is the reviewed reference?"],
            "notes": ["Offline synthetic fixture; no Gemini request was made."],
        }
    )
    if unknown:
        values = suggestions.model_dump(mode="json")
        for key in ("dimensions_m", "mass_kg", "sliding_friction"):
            values[key] = None
        values["notes"] = ["Offline unknown-value fixture; no Gemini request was made."]
        suggestions = PropertySuggestions.model_validate(values)
    folder = SuggestionService(store, settings).folder(job_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "gemini.json"
    if path.exists() and not replace:
        raise FileExistsError("Suggestion cache already exists; pass --replace-seed deliberately")
    record = {
        "model": "offline-synthetic-fixture",
        "requested_model": settings.gemini_model,
        "fallback_models": list(settings.gemini_fallback_models),
        "fallback_used": False,
        "object_hint": None,
        "created_at": datetime.now(UTC).isoformat(),
        "suggestions": suggestions.model_dump(mode="json"),
        "acceptance_fixture": True,
    }
    temporary = folder / "gemini.json.acceptance-partial"
    temporary.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--host", choices=("127.0.0.1",), default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--app-token", default="ui-acceptance-only")
    parser.add_argument("--seed-job", type=UUID)
    parser.add_argument("--replace-seed", action="store_true")
    parser.add_argument("--unknown-seed", action="store_true")
    from tools.ui_acceptance_replay import GEMINI_SCENARIOS

    parser.add_argument(
        "--gemini-replay",
        choices=GEMINI_SCENARIOS,
        help="Local response fixture for every uncached Gemini request in this run",
    )
    parser.add_argument(
        "--fail-processing-job",
        type=UUID,
        help="Fail this job's next preparation/validation once; retry then runs normally",
    )
    parser.add_argument(
        "--fail-processing-stage", choices=("preparation", "validation"), default="validation"
    )
    parser.add_argument(
        "--fail-next-reconstruction",
        action="store_true",
        help="The next synthetic upload fails at provider polling; no remote calls",
    )
    args = parser.parse_args()
    settings = acceptance_settings(args.data_dir, args.app_token)
    if args.seed_job is not None:
        path = seed_suggestions(
            settings, args.seed_job, replace=args.replace_seed, unknown=args.unknown_seed
        )
        print(f"Seeded offline synthetic suggestion cache: {path}")
        return
    import uvicorn

    app = build_app(
        settings.data_dir,
        settings.api_token,
        gemini_replay=args.gemini_replay,
        fail_processing_job=args.fail_processing_job,
        fail_processing_stage=args.fail_processing_stage,
        fail_next_reconstruction=args.fail_next_reconstruction,
    )
    print(f"Offline UI acceptance: synthetic provider; data={settings.data_dir}")
    uvicorn.run(app, host=args.host, port=args.port, access_log=True)


if __name__ == "__main__":
    main()
