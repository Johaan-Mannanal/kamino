# Photo2Sim

Turn photos of real objects into editable MuJoCo simulation assets. Built for Cal Hacks 13.0.

**Goal:** demonstrate two objects going from photos to downloadable simulation scenes, with confirmed dimensions, documented physical assumptions, collision geometry, and basic simulation checks.

**Workflow:** Photos → generated mesh → scale and property confirmation → collision geometry → simulation validation → downloadable scene.

## Start here

- [Ordered project phases](docs/PROJECT.md): scope, task list, and acceptance criteria.
- [Sponsor targets](docs/SPONSORS.md): Fetch.ai, Vultr, and Gemini API.
- [Shared Markdown folder](docs/team-notes/): upload context, research, and handoffs.
- [Working together](CONTRIBUTING.md): branches, interfaces, and cross-computer handoffs.
- [Capture workspace](hardware/README.md): photography and reference measurements.

## Current status

The shared repository is a scaffold. Reconstruction, simulation export, the application, and sponsor integrations still need implementation. Completed files on a teammate's branch are not automatically part of `main`.

The Windows handoff reports working wrist-camera capture. Image sharpness at task distances still needs evaluation. Any useful camera may supply object photos; physical arm control is optional. See the [pivot decision](docs/decisions/2026-10-23-photo-to-simulation.md).

## Basic infrastructure

| Component | Planned tool / responsibility |
| --- | --- |
| Reconstruction | Meshy multi-image API; API access and credits must be confirmed |
| Geometry | trimesh and NumPy: inspection, orientation, scaling, collision proxies |
| Simulation | MuJoCo Python and its native viewer |
| Backend | FastAPI and Pydantic, with a background job worker |
| Storage | Local asset files and SQLite for job state initially |
| Interface | Uploads, progress, editable properties, preview, export |
| AI assistance | Gemini: suggestions and requests for missing measurements |
| Agent / hosting | Fetch workflow integration; Vultr for actual hosting or processing |

Geometry generation does not establish physical accuracy. Measured values and assumptions must be distinguishable. A scene passing loading/contact checks is not proof of successful policy training or transfer to hardware.

## Layout

```text
docs/
  PROJECT.md          Ordered phases and acceptance criteria
  SPONSORS.md         Sponsor integrations and regular award targets
  team-notes/         Shared Markdown uploads and handoffs
  decisions/          Agreed changes in direction
src/photo2sim/
  assets/             Reconstruction, asset metadata, geometry preparation
  simulation/         MuJoCo export and validation
  integrations/       Gemini, Fetch, and provider adapters
  web/                API, interface, background jobs, status
tools/simulation/     Standalone simulation checks and helper commands
examples/simulation/  Small portable scenes and test fixtures
hardware/             Capture fixtures and measurements
tests/                Automated checks as implementation arrives
```

## Python setup

Use **Python 3.12** in a dedicated `.venv-sim`. Preserve the working Windows LeRobot environment separately.

macOS/Linux:

```bash
python3.12 -m venv .venv-sim
source .venv-sim/bin/activate
python -m pip install -e '.[dev,simulation]'
```

Windows PowerShell:

```powershell
py -3.12 -m venv .venv-sim
.\.venv-sim\Scripts\python.exe -m pip install -e ".[dev,simulation]"
```

For backend/docs-only work, install `.[dev]` instead. Copy `.env.example` to `.env` only if you do not already have a local configuration. The configuration keys are planned placeholders; there is no runnable server or automatic `.env` loader yet.

## Checks

Run with the active environment, or use `.\.venv-sim\Scripts\python.exe` explicitly on Windows:

```bash
python -m ruff check .
python -m ruff format --check .
python -c "import photo2sim"
```

Once implementation tests exist, run `python -m pytest`. There are no automated tests yet; CI currently checks lint, formatting, and package import on Python 3.12.

Keep API keys in `.env`. Store generated assets, large captures, and local databases under ignored `artifacts/`, `outputs/`, or `data/`. Commit only small intentional example fixtures with their provenance.

## Existing clones after the rename

The GitHub repository is now `Johaan-Mannanal/photo2sim`. Your existing local directory can retain its name, including the Windows `calhacks-arm` directory.

```bash
git remote set-url origin https://github.com/Johaan-Mannanal/photo2sim.git
git fetch origin
```

Preserve uncommitted work and coordinate integration on your existing branch. The scaffold's import name changed from `dummy` to `photo2sim`; update any new imports accordingly.
