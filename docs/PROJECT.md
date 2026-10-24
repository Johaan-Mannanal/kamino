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

The backend branch has working upload/status/property/download endpoints, SQLite persistence, an explicitly synthetic cube provider, and a Meshy adapter. Its 44 tests, local HTTP smoke, and Python 3.12 CI passed; see the [backend evidence](team-notes/2026-10-23-backend-baseline.md). Live Meshy generation and the combined simulation pipeline remain unverified.

Yash pushed the reusable exporter/validator on `codex/windows-simulation-setup` at `6298d6e`, after merging shared contracts from the backend branch. `export_asset` consumes prepared metre-based, geometry-only OBJ/STL with box collisions; `validate_export` reports loading, contact, settling, timing, and relocation. His Windows report records three passing synthetic cases, native viewer inspection, and 62 passed / 2 skipped tests. Code and handoff were inspected here; Windows executions have not been rerun on this Mac or merged into this backend branch. Next is orchestration integration after Srijan's preparation handoff. Srijan/Atul progress remains pending their reports.

Use [the shared contract](API.md) for module boundaries and units. Agents can start from `origin/codex/backend-pipeline`; work on their own branches and preserve others' changes. Full instructions: [Srijan](handoffs/srijan-agent.md), [Atul](handoffs/atul-agent.md).

**Next for Johaan:** integrate Srijan's preparation with Yash's exporter/validator, persist validation reports and failure artifacts, and return a portable bundle to Atul's UI. The first real photo-to-mesh milestone is complete; the full simulation pipeline and second object remain outstanding.

Meshy and Gemini authentication are verified locally. Approved 1024-pixel JPEG copies completed one real Meshy task through the backend. The downloaded GLB loads, has finite vertices, is watertight, and was inspected in a static geometry preview. Its properties are explicitly estimated at the user's request. The [real reconstruction example](../examples/reconstruction/apple-20w-charger/README.md) is ready for Srijan; no orientation/scale preparation or simulation acceptance is claimed yet. See [environment setup](ENVIRONMENT.md).

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
- [x] Build a small labeled synthetic simulation fixture (Windows report and pushed evidence at `33393ab`; cube and cuboid).
- [ ] Confirm API access/credits before making provider execution a dependency.

The interface and simulator can progress independently using mocks and fixtures.

### Phase 3 — Prove photo-to-mesh generation

- [x] Capture one to four views of the same object (first charger; sharpness/fine detail remain limitations).
- [x] Submit a Meshy reconstruction job and report its status (first charger).
- [x] Download and preserve GLB output before provider URLs expire (first charger).
- [x] Inspect one result's geometry before expanding features (loads, watertight, static preview; fine fidelity unverified).
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
