# Kamino

![Kamino — From photos to simulation. Real objects. Editable physics.](docs/images/echo-banner.png)

Turn object photos into editable, portable MuJoCo assets. Inspect the mesh, review
its size and physics, then export a runnable scene—with earlier versions preserved.

[Open Kamino](https://kamino.design) · [Devpost](https://devpost.com/software/kamino) ·
[Figma design](https://www.figma.com/design/rSOvF7zmhYyGwLxGqLRgAo/Untitled?node-id=0-1&m=dev) ·
[Design evidence and access status](docs/FIGMA_EVIDENCE.md) ·
[Echo brand assets](docs/brand-guidelines.md)

Built for Cal Hacks 13.0 by Johaan, Atul, Srijan and Yash.
The hosted app uses real reconstruction and estimate services. Creating jobs
requires a team-issued access code because provider usage is metered. The separate
**Use demo photos** experience is synthetic; its demo download is not a validated
MuJoCo bundle.

## Demo in motion

![MuJoCo recorded-arm visualization beside the final SO-101 physical replay, cropped around the arm and charger and manually aligned at visible motion events.](docs/images/demo-simulation-and-arm.gif)

**One shared loop, 2× playback.** Recorded arm poses with scripted charger motion
on the left; the final physical replay on the right. Timing is visually aligned
for presentation. [Still frame](docs/images/demo-simulation-and-arm-poster.png) ·
[Sources, crops and timing](docs/images/README.md)

## What you can do

![Three steps: upload photos for Meshy reconstruction; review geometry, uniform sizing and physical properties with Gemini assistance; export a portable MuJoCo scene, meshes and report. Corrections reuse the cached mesh and preserve earlier attempts.](docs/images/workflow.png)

- **Photos and mesh:** 2–4 views recommended; one supported, four maximum. Optional
  cropping retains originals. Source photos, Studio/Mesh controls and camera reset
  help you inspect the entire reconstruction used for export.
- **Size and physics:** one reviewed reference scales the mesh uniformly. Mass is
  editable; friction starts as estimated. Gemini can replace untouched default
  friction; other estimates require Apply. Without an estimate, friction uses a
  disclosed 0.8 simulator fallback. **Estimates are not measurements; Save commits drafts.**
- **Corrections and exports:** reopen, edit and regenerate without overwriting
  earlier inputs or downloads. [Advanced physics](docs/advanced-physics.md) covers
  collision shape, twist/rolling friction, inertia, contact response and placement.

The separate [assembly workbench](https://kamino.design/assembly.html) accepts
component meshes and reviewed link/joint definitions. See the
[guided assembly workflow](docs/GUIDED_ASSEMBLIES.md) and the
[hinge/slider, spring and linked-motion settings](docs/advanced-physics.md#assembly-sliders-springs-and-linked-motion). It does not automatically
infer a robot's articulation from photographs.

<details>
<summary><strong>See the workspace</strong> — synthetic mug demo</summary>

![Echo-branded Kamino workspace showing source photos, a procedural mug, uniform sizing and editable physical properties.](docs/images/workspace-demo.png)

The browser demo uses procedural geometry and session-only edits; its download
is not a validated MuJoCo bundle. Real server jobs use the saved workflow above.

</details>

## Simulation to physical robotics

Kamino connects simulation with physical robotics. We used the SO-101 leader arm to record an initial joint trajectory, brought that motion into MuJoCo, and previewed and adjusted it for the charger demonstration. We then exported the joint motion and executed it on the physical SO-101 follower arm, iterating between simulation and hardware to account for real-world differences. The prototype demonstrates corresponding, working motions side by side, powered by our software. Precise calibration and contact-rich manipulation remain ongoing work.

**Workflow:** leader-arm recording → simulation preview and adjustment → joint-motion export → follower-arm execution → iteration between simulation and hardware.

See [the robotics demonstration](docs/ROBOTICS_DEMO.md) for the workflow and its scope. This prototype is distinct from the controls exposed in the hosted photo workspace.

## How it works

<details>
<summary>Architecture and implementation</summary>

```mermaid
flowchart LR
    P[Object photos] --> M[Meshy reconstruction]
    P --> G[Gemini property suggestions]
    M --> W[Editable workspace]
    G --> W
    W --> R[Saved orientation, uniform reference and properties]
    R --> S[MuJoCo preparation and checks]
    S --> Z[Portable ZIP and report]
    R --> H[Revision and attempt history]
```

- **Browser:** TypeScript, Vite and Three.js. The current site lives in
  `prototypes/kamino-ui`; the directory name is historical. Shared viewer/API code
  and the assembly page live in `frontend`.
- **Backend:** FastAPI and Pydantic, with SQLite and local artifact storage.
- **Geometry and simulation:** trimesh, NumPy and MuJoCo.
- **Hosting:** Railway frontend/backend services; `kamino.design` was registered
  through the GoDaddy Registry event offer at Porkbun.
- **Compatibility:** Python imports and environment variables retain the
  `photo2sim` / `PHOTO2SIM_*` names. The public project and repository are Kamino.

</details>

## Run locally without provider charges

Requirements: Python 3.12+ with a compatible MuJoCo wheel, Node.js 22.12+ and
pnpm 11.25.0. Keep this environment separate from your robot/LeRobot environment.

```sh
git clone https://github.com/Johaan-Mannanal/kamino.git
cd kamino
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev,simulation]'
pnpm --dir frontend install --frozen-lockfile
pnpm --dir prototypes/kamino-ui install --frozen-lockfile
```

On Windows, create the environment with `py -3.12 -m venv .venv` and use
`.\.venv\Scripts\python.exe` for Python commands (or activate it in your shell).
Intel macOS release checks used Python 3.13 and MuJoCo 3.3.7.

Start the isolated mock API from the repository root:

```sh
python -m tools.run_demo --frontend-port 5188
```

In another terminal:

```sh
pnpm --dir prototypes/kamino-ui dev
```

Open **http://127.0.0.1:5188** and enter the temporary application token printed by
the backend when prompted. This launcher ignores `.env`, uses synthetic reconstruction
and makes no provider calls. Generated server bundles still use real MuJoCo
processing. For the assembly page, run `pnpm --dir frontend dev` and use the
[assembly demo instructions](docs/DEMO.md), including its allowed frontend origin.

For real photos-to-mesh requests, configure backend-only credentials and start the
normal API as described in [environment setup](docs/ENVIRONMENT.md). Real provider
requests can incur charges. Never put provider keys or access codes in frontend
build variables, URLs or Git.

## Verification and release

The live application includes the
[Echo branding release `cb57f0e`](https://github.com/Johaan-Mannanal/kamino/commit/cb57f0e)
on the advanced-physics baseline `410e88a`. README/media changes do not redeploy it.

| Check | Result and scope |
| --- | --- |
| Backend | **492 passed, 2 optional skips**; Ruff passed |
| Frontend | **143 shared + 163 Workspace tests passed**; both typechecks/builds passed |
| Browser | Responsive headers, 200% zoom, saved sizing, sharing assets and existing viewer flows checked |
| Hosted exports | New branded export ran after relocation; **15 existing production ZIPs stayed byte-identical** |

Earlier advanced-physics acceptance also covered 202 local browser checks, hosted
rigid/assembly regeneration and a 10,000-step relocated run. Browser mobile checks
use Chromium emulation. Numerical validation does not establish physical accuracy.
No new Meshy or Gemini calls were needed for these release checks.

See the [release and evidence index](docs/RELEASE.md) and
[GitHub Actions](https://github.com/Johaan-Mannanal/kamino/actions/workflows/checks.yml).

<details>
<summary>Run the verification commands</summary>

```sh
python -m pytest -q
python -m ruff check .
python -m ruff format --check .
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir prototypes/kamino-ui test
pnpm --dir prototypes/kamino-ui build
```

</details>

## Sponsor work and evidence

| Track / service | What Kamino actually uses | Evidence / qualification |
| --- | --- | --- |
| Google Gemini / MLH — Best Use of Gemini API | Photo-based property suggestions, notes, bounded retries and fallback provenance | [Implementation and sponsor status](docs/SPONSORS.md) |
| Figma — Best Figma Workflow Hack | Design and prototype work informing the implemented UI | [Design link, implementation links and outstanding public evidence](docs/FIGMA_EVIDENCE.md) |
| GoDaddy Registry / MLH — Best Domain Name | The `kamino.design` domain, registered at Porkbun | [Live HTTPS site](https://kamino.design); hosting is Railway |
| Microsoft — Built for the Real World (including second-place Customer Impact Award) | Proposed fit for the robotics asset-preparation workflow | [Eligibility clarification](docs/handoffs/microsoft-real-world-track-assessment.md); sponsor confirmation pending |

These are our four confirmed sponsor pursuits, not claims of eligibility approval
or completed opt-in. Our general award targets are **Cal Hacks Overall
(first/second/third)**, **Most Technically Complex Hack** and **Most Creative Hack**.

No Azure integration is claimed. The inspected Microsoft rules do not specify an
Azure requirement; they do require an AI agent, and the fit of this human-reviewed
workflow remains unconfirmed. Bright Data, Apify, Fetch.ai and Vultr are not current
Kamino integrations or submission claims. Historical research remains in Git.

## Limits to keep in mind

Reconstruction can invent details or distort proportions, including on familiar
objects. Gemini recognizing an object does not constrain Meshy's independent mesh
output. Uniform scaling cannot repair an incorrectly shaped mesh. Because the
whole reconstruction is exported, unwanted reconstructed surroundings also remain.

A numerical physics pass establishes only the checks in its report. Collision
proxies, estimated mass/friction and unverified geometry limit physical fidelity.
The SO-101 prototype demonstrates trajectory transfer: leader-recorded motion is
previewed and adjusted in simulation, exported, and executed on the follower arm,
with iteration between simulation and hardware. Precise calibration, physical
alignment and contact-rich manipulation remain ongoing work. Earlier observation
playback and illustrative animations are separate artifacts; their limitations
do not describe the full trajectory-transfer demonstration.

Optional end-user CAD uploads and automatic parameter-correction proposals are
not part of the released photo workspace. Research/import utilities and historical
examples should not be read as shipped UI features.

[Current project scope](docs/PROJECT.md) · [API](docs/API.md) ·
[Railway deployment](deploy/railway/README.md) · [Examples and provenance](examples/README.md)

## Reuse and attribution

The repository is public, but a project-wide reuse license has not yet been
selected. Third-party robot assets retain their [upstream license](third_party/robotstudio_so101/LICENSE)
and [source attribution](third_party/robotstudio_so101/README.md). See
[publication status](docs/PUBLICATION.md) for outstanding presentation/evidence items.
