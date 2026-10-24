# Photo2Sim

Turn photos of real objects into editable MuJoCo simulation assets. Built for Cal Hacks 13.0.

**Goal:** reusable conversion middleware for robotics and engineering. Photos,
optional CAD and measurements become reviewed geometry, physical properties and
articulation, then a runnable simulator export that can be iterated.

**Workflow:** Inputs → geometry/part proposals → user corrections to scale,
properties and joints → simulation export → validation and refinement.

The rigid-object workflow is working. Guided articulated conversion is now the
next milestone; automatic photos-to-robot conversion is not yet implemented.

## Start here

- [Ordered project phases](docs/PROJECT.md): scope, task list, and acceptance criteria.
- [Sponsor targets](docs/SPONSORS.md): Fetch.ai, Vultr, and Gemini API.
- [Shared Markdown folder](docs/team-notes/): upload context, research, and handoffs.
- [Working together](CONTRIBUTING.md): branches, interfaces, and cross-computer handoffs.
- [Shared API and asset contracts](docs/API.md): exact endpoints, units, and integration boundaries.
- [Team environment setup](docs/ENVIRONMENT.md): which credentials each laptop needs.
- [Vultr deployment](deploy/README.md): container, HTTPS, access token and persistence checks.
- [Current Windows handoff](docs/handoffs/yash-articulated-demo.md); older Srijan/Atul handoffs are historical.
- [Example provenance](examples/README.md): generated assets, synthetic fixtures and imported references.
- [Capture workspace](hardware/README.md): photography and reference measurements.

## Current status

The backend branch connects uploads, persistent jobs, Meshy reconstruction, explicit property confirmation, geometry preparation, MuJoCo validation, and authenticated ZIP downloads. The integrated frontend includes mesh preview, saved orientation and Gemini suggestions. The cleaned real charger completed through the API and passed Windows native-viewer and relocation checks; dimensions/mass remain estimated and collision/inertia approximate. Gemini suggestions have a successful live backend request; frontend acceptance used cached suggestions. Fetch public integration and Vultr deployment remain unfinished. Main is separate from feature integration.

The intended articulated demo converts the SO101 itself through reusable assembly
preparation/review/export, then compares it with the physical arm. Our existing
[SO101 scene](examples/so101/WORKSPACE.md) uses an **imported reference model**;
it does not prove articulated conversion. Windows combined-viewer/reset acceptance
was reported by Yash at `74cf11a`. Physical mapping remains unverified.

A [reviewed assembly format](docs/ASSEMBLIES.md) and
[synthetic two-link export](examples/assemblies/two-link-hinge/README.md) now
provide the local articulated-conversion foundation. CAD grouping, photo part/joint inference and assembly UI/API
integration remain future work. See [the plan](docs/PROJECT.md).

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
  contracts.py        Shared job, property, and asset models
  api/                Job API, SQLite persistence, background reconstruction
  assets/             Reconstruction, asset metadata, geometry preparation
  simulation/         MuJoCo export and validation
  integrations/       Gemini, Fetch, and provider adapters
frontend/             Integrated upload, properties, preview and export UI
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

Use `.[dev,simulation]` for the full pipeline; `.[dev]` alone supports capture/reconstruction without simulation processing. Intel Macs can use Python 3.13 with `mujoco==3.3.7`, which has an Intel wheel; current 3.17 wheels are not available for Intel macOS. Windows/Linux should use the current simulation extra and record their actual versions. Copy `.env.example` to `.env` only if you do not already have local configuration. The backend reads `.env` from the working directory; shell variables take precedence. See [team environment setup](docs/ENVIRONMENT.md) for Gemini/Fetch/Vultr fields and their implementation status.

## Run the backend

With the environment active:

```bash
python -m uvicorn photo2sim.api.app:create_app --factory --host 127.0.0.1 --port 8000
```

Windows without activating:

```powershell
.\.venv-sim\Scripts\python.exe -m uvicorn photo2sim.api.app:create_app --factory --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs` to upload 1–4 images under `images`, poll the returned job ID, PATCH confirmed properties, then POST `/api/jobs/{id}/process` with no body. Poll until `completed` or `failed`; successful jobs expose `bundle_path` for ZIP download through the files endpoint. The default provider is **mock**: uploaded images do not influence this known synthetic cube. See [API details](docs/API.md) and the [real charger bundle](examples/simulation/apple-20w-charger/README.md).

Use **one server process/worker** for this in-process job executor. Do not run multiple servers against the same job database. Existing queued jobs resume on startup; saved provider task IDs are polled again. A submission interrupted before its task ID was saved is marked uncertain, with no automatic paid resubmission.

For real reconstruction, explicitly set `PHOTO2SIM_PROVIDER=meshy` and `MESHY_API_KEY` in the server environment before starting. `MESHY_MODEL` defaults to `meshy-6`. The adapter requests untextured GLB geometry and preserves outputs locally. Provider API access/credits are separate from this software; no live generation is established by the HTTP-transport tests. [Official Meshy API reference](https://docs.meshy.ai/en/api/multi-image-to-3d).

## Checks

Run with the active environment, or use `.\.venv-sim\Scripts\python.exe` explicitly on Windows:

```bash
python -m ruff check .
python -m ruff format --check .
python -c "import photo2sim"
python -m pytest -q
```

CI checks lint, formatting, package import, and tests on Python 3.12. Backend tests cover actual local uploads, persistence, property validation, downloads, and restart behavior; Meshy tests replace only the external HTTP transport.

Keep API keys in `.env`. Store generated assets, large captures, and local databases under ignored `artifacts/`, `outputs/`, or `data/`. Commit only small intentional example fixtures with their provenance.

## Existing clones after the rename

The GitHub repository is now `Johaan-Mannanal/photo2sim`. Your existing local directory can retain its name, including the Windows `calhacks-arm` directory.

```bash
git remote set-url origin https://github.com/Johaan-Mannanal/photo2sim.git
git fetch origin
```

Preserve uncommitted work and coordinate integration on your existing branch. The scaffold's import name changed from `dummy` to `photo2sim`; update any new imports accordingly.

### Guided articulated assemblies

Open `/assembly.html` in the frontend for local part grouping, pivot/joint review
and kinematic sliders. See [guided workflow](docs/GUIDED_ASSEMBLIES.md) and
[SO101 CAD/template candidate](examples/assemblies/so101-guided/README.md).
This candidate passes template frame checks but fails dynamic tracking; it is
not a photo-inferred or physically calibrated arm.
