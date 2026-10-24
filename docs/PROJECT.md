# Photo2Sim project plan

## Goal

Turn photos of a real object into an editable MuJoCo simulation asset, with confirmed dimensions, documented physical assumptions, collision geometry, and basic simulation checks. Demonstrate the complete workflow on two objects.

## Workflow

Photos → generated mesh → scale and property confirmation → collision geometry → simulation validation → downloadable scene.

## Current status and coordination

This is the overall project checklist. Update it as verified handoffs arrive; keep the phase order and do not add an hourly schedule.

- **Johaan + this agent:** shared contracts, backend, Meshy integration, final integration, and later Vultr deployment. Branch: `codex/backend-pipeline`.
- **Yash + Windows agent:** MuJoCo export, physics checks, native viewer, and portable simulation bundles. Branch: `codex/windows-simulation-setup`.
- **Srijan + his agent:** geometry preparation, scale/orientation, collision proxies, and later Gemini property assistance. Branch: `codex/asset-preparation`.
- **Atul + his agent:** frontend workflow and later Fetch/ASI:One integration. Branch: `codex/web-workflow`.

The backend branch has working upload/status/property/download endpoints, SQLite persistence, an explicitly synthetic cube provider, and a Meshy adapter. Its 44 tests, local HTTP smoke, and Python 3.12 CI passed; see the [backend evidence](team-notes/2026-10-23-backend-baseline.md). Live Meshy generation and the combined simulation pipeline remain unverified. Other computers' progress is pending their handoffs.

Use [the shared contract](API.md) for module boundaries and units. Agents can start from `origin/codex/backend-pipeline`; work on their own branches and preserve others' changes. Full instructions: [Srijan](handoffs/srijan-agent.md), [Atul](handoffs/atul-agent.md).

**Next for Johaan:** confirm Meshy API access/credits, capture one simple object's views and reference measurements, then run one real reconstruction through the backend and inspect the saved GLB. This can progress while the other computers build their modules. Do not substitute a mock success for this milestone.

## Prize targets

Sponsor targets are **Fetch.ai, Vultr, and Gemini API**. Regular targets are **Overall, Most Technically Advanced, and Most Creative Project**. Meaningful integrations and eligibility requirements are tracked in [the sponsor checklist](SPONSORS.md).

## Basic infrastructure

- Reconstruction: Meshy multi-image API, subject to confirmed access and credits.
- Geometry: trimesh and NumPy.
- Simulation: MuJoCo Python with its native viewer.
- Application: FastAPI, Pydantic, a minimal web interface, and a background job worker.
- Storage: local files for assets; SQLite for persistent job state initially.
- AI assistance: Gemini proposes labeled assumptions and asks for missing measurements.
- Sponsor services: Fetch exposes the same application workflow; Vultr may host actual backend or processing jobs.
- Environment: Python 3.12 in a separate `.venv-sim`; preserve the Windows LeRobot environment.

This list describes the intended full stack; only the components identified above have verified implementation evidence here.

## Ordered phases

### Phase 1 — Define the MVP

- [ ] Select two opaque, rigid, mostly convex objects.
- [ ] Record available dimensions and mass, with measuring methods and units.
- [x] Publish shared asset/job contracts: mesh paths, dimensions in metres, mass in kilograms, collision representation, friction assumptions, and provenance for each value (backend branch; coordinate revisions).
- [ ] Set acceptance criteria for a usable export and document unsupported shapes.

The core deliverable is an editable simulation asset. Robot-policy training, physical deployment, and automated arm scanning are stretch goals.

### Phase 2 — Prepare infrastructure

- [ ] Verify the isolated Python environment and record exact versions.
- [x] Establish an API and background job boundary with persistent progress/errors (backend branch).
- [x] Build clearly labeled mock reconstruction results (synthetic cube provider).
- [ ] Build a small labeled synthetic simulation fixture (Windows task).
- [ ] Confirm API access/credits before making provider execution a dependency.

The interface and simulator can progress independently using mocks and fixtures.

### Phase 3 — Prove photo-to-mesh generation

- [ ] Capture one to four sharp views of the same object.
- [ ] Submit a Meshy reconstruction job and report its status.
- [ ] Download and preserve OBJ/GLB outputs before provider URLs expire.
- [ ] Inspect one usable result before expanding features.
- [ ] Keep completed results available after downstream failures.

### Phase 4 — Prepare geometry and properties

- [ ] Inspect orientation and apply measured scale.
- [ ] Create collision geometry separately from the visible mesh, starting with simple convex proxies.
- [ ] Confirm mass and label friction/contact assumptions.
- [ ] Record whether each property is measured, user-supplied, sourced, or estimated.
- [ ] Validate AI suggestions deterministically before export.

Unknown values remain explicit. A material label alone does not establish mass or friction between contacting surfaces.

### Phase 5 — Generate and validate MuJoCo assets

- [ ] Export `scene.xml`, relative-path meshes, and metadata.
- [ ] Check loading, scale, valid mass/inertia, contact, and settling.
- [ ] Inspect visual and collision geometry separately in the viewer.
- [ ] Produce a report that distinguishes headless checks from viewer observations.
- [ ] Copy the bundle to another directory and verify portability.

Passing these checks establishes basic simulation usability, not measured real-world accuracy or successful policy training.

### Phase 6 — Complete the application

- [ ] Connect upload, processing, property confirmation, preview, and download.
- [ ] Provide actionable errors and retries that retain completed work.
- [ ] Run the entire pipeline on two real objects.
- [ ] Record total processing time, manual edits, and failure causes.

### Phase 7 — Integrate sponsor tools

- [ ] Fetch: expose the primary workflow through ASI:One, register the agent, implement its chat protocol, and complete submission requirements.
- [ ] Vultr: deploy actual backend or processing jobs if access is available.
- [ ] Gemini: use it for the property-assistance workflow and document its contribution.
- [ ] Verify final eligibility and submission requirements using [the sponsor checklist](SPONSORS.md).

### Phase 8 — Validate, polish, and submit

- [ ] Compare setup effort against a documented manual baseline.
- [ ] Record an end-to-end demo and clearly identify cached backup examples.
- [ ] Document supported objects, limitations, setup commands, and physical assumptions.
- [ ] Complete Devpost and sponsor-specific submissions before the official deadline.
- [ ] If the core is reliable, add parameter variations or scripted simulated manipulation.

## Evidence to preserve

Source photos, mesh-generation job identity, reference measurements, property provenance, collision representation, validation report, export bundle, timing, and demo evidence. Keep secrets out of reports and distinguish real provider execution from mocks and cached outputs.
