# DUMMY

A robotic assembly assistant built with an SO-101 leader/follower arm for Cal Hacks 13.0.

**Goal:** describe a supported assembly, validate the plan, and assemble purpose-designed 3D-printed parts using reusable robot skills.

## Start here

- **Share Markdown files:** upload them to [docs/team-notes/](docs/team-notes/). Use GitHub's **Add file → Upload files**, or commit locally.
- **Build scope and milestones:** [Project plan](docs/PROJECT.md).
- **Ownership and collaboration:** [Contributing](CONTRIBUTING.md).
- **Physical designs:** [Hardware workspace](hardware/README.md).

## Current status

Reported working on the hardware laptop: calibration, teleoperation, demonstration recording, and trajectory replay. These have not been verified from this repository.

This repository provides the shared structure and Python package scaffold. The planner, validator, robot executor, web interface, and Fetch integration are not implemented yet.

## Layout

```text
docs/
  PROJECT.md          Scope, ownership, integration contract, milestones
  team-notes/         Upload Markdown context, research, and handoffs here
  decisions/          Short records of agreed decisions
hardware/
  cad/                Editable CAD sources
  prints/             STL/3MF exports and print notes
src/dummy/
  planning/           World model, planner, validation — Johaan
  robot/              LeRobot adapter, skills, motion execution — Srijan
  web/                API, interface, execution status — Atul
tests/                Planner, validation, integration tests as code arrives
```

## Python setup

Use **Python 3.12**, matching the reported working hardware environment.

macOS/Linux:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
cp .env.example .env
```

Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
Copy-Item .env.example .env
```

The starter dependencies are FastAPI, Uvicorn, and Pydantic; development tools are pytest and Ruff. There is no runnable server yet. Environment variables are placeholders; loading `.env` will need to be implemented with the application.

**Hardware laptop:** keep the working LeRobot environment. Record its Python version, LeRobot commit, and installed dependencies before changing it. LeRobot is intentionally not installed by this scaffold. Srijan owns connecting the executor to that environment.

## Checks

After installing the development tools:

```bash
python -m ruff check .
python -m ruff format --check .
python -m pytest
```

No tests exist yet; pytest will report no tests until the first implementation lands. CI runs lint and format checks for now.

Keep API keys in your local `.env`. Keep recordings, checkpoints, and videos outside Git; share their locations in team notes.
