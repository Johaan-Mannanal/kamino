# Backend baseline handoff

Branch: `codex/backend-pipeline`. Shared-contract starting commit: `641084f`; get the latest branch tip for the full backend. Feature branches should preserve their own changes when integrating newer backend commits.

## Implemented

Typed shared asset/job contracts; FastAPI upload/status/property/download routes; SQLite persistence; two reconstruction worker threads; a clearly synthetic cube provider; and a Meshy multi-image adapter. The default provider is mock. Live Meshy generation has not run. Geometry preparation, simulation export, frontend, Fetch and Vultr deployment are not connected here.

Read `docs/API.md` for exact interfaces and `README.md` for setup. Srijan/Atul instructions live in `docs/handoffs/`. Yash should keep the standalone Windows baseline and use the documented `export_asset` boundary for later integration.

## Commands

```bash
python -m pip install -e '.[dev]'
python -m uvicorn photo2sim.api.app:create_app --factory --host 127.0.0.1 --port 8000
python -m pytest -q
python -m ruff check .
python -m ruff format --check .
```

Use one server worker/process per data directory. The server reads shell environment variables and does not load `.env` automatically. There is no automatic external submission retry. Saved task IDs resume polling after restart; uncertain interrupted submissions fail explicitly instead of creating duplicate paid jobs. Download failures and polling limits preserve task IDs and inputs for inspection, but no retry endpoint exists yet.

## Local evidence

- macOS Python 3.14.7 temporary environment; Python 3.12 is the intended teammate/CI environment.
- 44 tests passed before final review: contract validation, actual local API/storage/worker behavior, restart recovery, and Meshy transport fixtures.
- Ruff lint/format and local Markdown links passed.
- Actual HTTP smoke on a local Uvicorn process: health OK; upload 202; awaiting_properties; property save 200; mesh download 200; OpenAPI available. Input and output were synthetic.
- Installed FastAPI/Starlette emits a test-client deprecation warning about HTTPX; tests pass. No live Meshy call, MuJoCo run, browser UI check, or cloud deployment was performed here.

Next: connect Srijan's `prepare_asset` and Yash's `export_asset` after their verified handoffs, then allow the UI to launch the full pipeline. Preserve property provenance and synthetic labels through integration.
