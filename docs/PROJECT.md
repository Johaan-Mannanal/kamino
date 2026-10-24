# Photo2Sim project plan

## Goal

Turn photos of a real object into an editable MuJoCo simulation asset, with confirmed dimensions, documented physical assumptions, collision geometry, and basic simulation checks. Demonstrate the complete workflow on two objects.

Current demo priority is the accepted charger plus a live real-versus-simulated
SO101 action comparison. A second object follows the reliable first-object demo.

## Workflow

Photos → generated mesh → scale and property confirmation → collision geometry → simulation validation → downloadable scene.

## Current status and coordination

This is the overall project checklist. Update it as verified handoffs arrive; keep the phase order and do not add an hourly schedule.

- **Johaan + this agent:** backend/integration, Srijan's remaining geometry work,
  and the SO101 model/joint mapping. Vultr remains deferred.
- **GPT-6.1-sol frontend agent:** completed GLB preview, saved orientation,
  Gemini suggestions and real cached-object browser acceptance. Integrated
  and published on `codex/backend-pipeline` through `cc9e247`.
- **Yash + Windows agent:** native simulation acceptance and the actual SO101
  environment/calibration/recording inventory. Branch: `codex/windows-simulation-setup`.
- **Srijan and Atul:** no active implementation dependency; their remaining work
  has been taken over here with the user's approval.

**Verified core:** reconstruction → properties → preparation → MuJoCo
export/validation → authenticated ZIP download. The cleaned charger replaces the
old reconstruction that included its supporting slab. Yash reported native
Windows visual/coarse-box acceptance at `05a7c35`; pins point up, the old slab is
absent, and the USB-C recess is approximate. Estimated dimensions/mass and the
single collision-box limitation remain visible.

Saved orientation is now supported in persistent processing at `2ceb121`. The
cached cleaned charger completed through the API with +90° X rotation and passed
original/relocated checks locally. Yash then reported acceptance of the actual
API-generated ZIP on Windows at `eaa705c`: original/relocated checks passed,
native appearance and upward pins matched, saved +90° X rotation was retained,
and geometry matched the manual candidate within approximately 1e-17 m. See
[API acceptance](../examples/simulation/apple-20w-charger-cleaned/api-acceptance/README.md).
Gemini suggestions are live-tested through the backend; the frontend now loads
suggestions, requires explicit application/save, and preserves manual drafts.
The frontend acceptance used cached suggestions and a cached real charger;
it did not submit a new reconstruction or successful Gemini generation.
Fetch public integration and Vultr deployment are not complete.

**Current demo priority:** compare a real SO101 action live in person with its
simulated counterpart. Start with matching joint names, units, calibration and
reference poses before action replay. The pinned robot model and offline
inspection are in [SO101 setup](../examples/so101/README.md); the Windows evidence
request is [here](handoffs/yash-so101-mapping.md). A matching observation replay
establishes kinematic alignment, not a predictive dynamics model.

The [combined SO101/charger/table workspace](../examples/so101/WORKSPACE.md) now
passes original and relocated offline hold/drop/reset trials. Layout and servo
dynamics remain assumed; Windows combined-viewer acceptance and real-arm mapping
are pending. No physical arm commands or manipulation trials have been run here.

The [SO101 CAD review](../examples/so101/cad-review/README.md) resolved the STEP
geometry units to millimetres and compared 11 major components. Nominal bounding
dimensions agree within 0.006 mm, so the pinned robot geometry is retained.
Saved assembly axis tilts do not establish hardware zeros; reference poses,
gripper mapping and measured mounting/table/object placement remain required.

Use [the shared contract](API.md) for application boundaries. Preserve source
branches and uncommitted work; `main` remains separate from feature integration.

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

The core deliverable remains an editable simulation asset. The user has additionally prioritized a live real-versus-simulated SO101 action comparison; joint calibration and combined-scene acceptance are prerequisites. Robot-policy training and automated arm scanning remain stretch goals.

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
- [x] Keep completed results available after downstream failures (per-attempt preservation).

### Phase 4 — Prepare geometry and properties

- [ ] Inspect orientation and apply measured scale.
- [x] Create collision geometry separately from the visible mesh (box proxy).
- [ ] Confirm mass and label friction/contact assumptions.
- [x] Record whether each property is measured, user-supplied, sourced, or estimated.
- [ ] Validate AI suggestions deterministically before export.

Unknown values remain explicit. A material label alone does not establish mass or friction between contacting surfaces.

### Phase 5 — Generate and validate MuJoCo assets

- [x] Export `scene.xml`, relative-path meshes, and metadata (first charger and synthetic fixtures).
- [x] Check loading, scale, valid mass/inertia, contact, and settling (headless first charger).
- [x] Inspect visual and collision geometry separately in the viewer (Windows charger acceptance).
- [x] Produce a report that distinguishes headless checks from viewer observations.
- [x] Copy the bundle to another directory and verify portability (first charger).

Passing these checks establishes basic simulation usability, not measured real-world accuracy or successful policy training.

### Phase 6 — Complete the application

- [x] Connect upload, processing, property confirmation, preview, and download (published backend-branch integration through `cc9e247`).
- [x] Provide errors and simulation retries that retain completed work, with frontend controls.
- [ ] Run the entire pipeline on two real objects.
- [ ] Record total processing time, manual edits, and failure causes.

### Phase 7 — Integrate sponsor tools

- [ ] Fetch: expose the primary workflow through ASI:One, register the agent, implement its chat protocol, and complete submission requirements.
- [ ] Vultr: deploy actual backend or processing jobs if access is available.
- [x] Gemini: connect the property-assistance API and verify a real request; explicit frontend adoption is implemented. Sponsor submission remains pending.
- [ ] Verify final eligibility and submission requirements using [the sponsor checklist](SPONSORS.md).

### Phase 8 — Validate, polish, and submit

- [ ] Compare setup effort against a documented manual baseline.
- [ ] Record an end-to-end demo and clearly identify cached backup examples.
- [ ] Document supported objects, limitations, setup commands, and physical assumptions.
- [ ] Complete Devpost and sponsor-specific submissions before the official deadline.
- [ ] If the core is reliable, add parameter variations or scripted simulated manipulation.

## Evidence to preserve

Source photos, mesh-generation job identity, reference measurements, property provenance, collision representation, validation report, export bundle, timing, and demo evidence. Keep secrets out of reports and distinguish real provider execution from mocks and cached outputs.
