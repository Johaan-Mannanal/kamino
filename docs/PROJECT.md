# Photo2Sim project plan

## Goal

Turn photos of a real object into an editable MuJoCo simulation asset, with confirmed dimensions, documented physical assumptions, collision geometry, and basic simulation checks. Demonstrate the complete workflow on two objects.

## Workflow

Photos → generated mesh → scale and property confirmation → collision geometry → simulation validation → downloadable scene.

## Basic infrastructure

- Reconstruction: Meshy multi-image API, subject to confirmed access and credits.
- Geometry: trimesh and NumPy.
- Simulation: MuJoCo Python with its native viewer.
- Application: FastAPI, Pydantic, a minimal web interface, and a background job worker.
- Storage: local files for assets; SQLite for persistent job state initially.
- AI assistance: Gemini proposes labeled assumptions and asks for missing measurements.
- Sponsor services: Fetch exposes the same application workflow; Vultr may host actual backend or processing jobs.
- Environment: Python 3.12 in a separate `.venv-sim`; preserve the Windows LeRobot environment.

These are planned components. A folder or dependency declaration does not mean the component is implemented.

## Ordered phases

### Phase 1 — Define the MVP

- [ ] Select two opaque, rigid, mostly convex objects.
- [ ] Record available dimensions and mass, with measuring methods and units.
- [ ] Agree on a shared asset record: mesh paths, dimensions in metres, mass in kilograms, collision representation, friction assumptions, and provenance for each value.
- [ ] Set acceptance criteria for a usable export and document unsupported shapes.

The core deliverable is an editable simulation asset. Robot-policy training, physical deployment, and automated arm scanning are stretch goals.

### Phase 2 — Prepare infrastructure

- [ ] Verify the isolated Python environment and record exact versions.
- [ ] Establish an API and background job boundary with persistent progress/errors.
- [ ] Build mock reconstruction results and a small labeled synthetic simulation fixture.
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
