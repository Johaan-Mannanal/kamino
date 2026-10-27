# Contributing to Kamino

Start with the [quickstart](docs/QUICKSTART.md) and run the complete example.
The repository is `https://github.com/Johaan-Mannanal/kamino`; existing local
folders may still be named `calhacks-arm`. Use `.venv` for this checkout and keep
robot/LeRobot environments separate.

## Before making a change

Check [existing issues](https://github.com/Johaan-Mannanal/kamino/issues), then open
an issue describing the problem or proposed change. For a small correction, a
focused pull request is welcome. Maintainer: [Johaan Mannanal](https://github.com/Johaan-Mannanal).
There is no promised response time; this is an experimental project.

A root license has not been selected. Read [license status](docs/LICENSING_OPTIONS.md)
before submitting new code; maintainers need to resolve contributor terms before
accepting outside code contributions. Bug reports and documentation feedback can
still be discussed. No CLA or DCO is imposed by this guide.

## Code map

- `src/photo2sim/api`: FastAPI, job persistence and workers.
- `src/photo2sim/assets`, `simulation`, `assemblies`: geometry, physics and exports.
- `src/photo2sim/integrations`: Meshy and Gemini adapters.
- `prototypes/kamino-ui`: current website and Workspace (historical directory name).
- `frontend`: shared API/viewer controls and the assembly workbench.
- `tests`, frontend `src/*.test.ts`: backend and UI regression tests.
- `examples`: small intentional fixtures with their provenance.
- `deploy/railway`: combined website build and hosting configuration.

## Workflow and checks

Branch from current `main`, preserve unrelated local work, and keep the change
focused. Add a regression test for a behavior change. Use synthetic inputs and
mock providers; routine checks must not spend provider credits or command hardware.

From the repository root with `.venv` active:

```sh
python -m pytest -q
python -m ruff check .
python -m ruff format --check .
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir prototypes/kamino-ui test
pnpm --dir prototypes/kamino-ui build
```

For a site change, also run `pnpm --dir prototypes/kamino-ui test:readiness` after
both builds. This checks entry links, example downloads, access disclosure, mobile
assembly layout and HTTP 404 recovery against the assembled site. It needs Caddy
2.10.2 on PATH (or `CADDY_BIN`) and Playwright Chromium installed.

## Pull requests

Explain the concrete problem, resulting behavior, checks run and known limitations.
Include before/after screenshots for visible changes and label synthetic/cached
inputs. Keep API keys, codes, personal photos, databases and large captures out of Git.
Use ignored `outputs/` for local results. Never overwrite earlier evidence or infer
physical accuracy from numerical checks. For a vulnerability, follow [SECURITY.md](SECURITY.md).

Older `docs/team-notes` and handoffs are historical team coordination; a new
contributor does not need to create a team handoff note for every pull request.
