# Photo2Sim project plan

## Product goal
Reusable conversion middleware for robotics and engineering: photos, optional
CAD and optional measurements become an editable physical model and a portable
simulator export. MuJoCo supplies the physics engine. Users review missing
information, assumptions, geometry and articulation, then revise and regenerate.

The SO101 itself is the intended articulated demonstration input. The charger
remains our proven rigid-object example. Running an imported SO101 model does
not demonstrate robot reconstruction by Photo2Sim. We aim for a guided workflow,
not automatic physical accuracy for arbitrary objects from photographs alone.

## Workflow
Photos / optional CAD / measurements → geometry and part proposals → user review
of scale, links, joints and physical properties → export → validation → comparison
and iterative correction. Missing evidence remains explicit; AI suggestions do
not become confirmed measurements automatically.

## Current evidence
| Capability | Status |
| --- | --- |
| Rigid photo reconstruction, editable properties/orientation, preview and ZIP | Working with cleaned charger; properties estimated |
| Gemini suggestions | Live backend request verified; explicit frontend adoption |
| Articulated assembly format and generated two-link proof | Local CLI/library implemented; Mac motion/reset/relocation checks pass; Windows viewer pending |
| Photo part segmentation / joint inference | Not implemented |
| CAD application import / rigid-link grouping | Local STEP importer and source-preserving grouping implemented |
| Assembly review UI / articulated job API | Local browser workbench implemented; HTTP jobs pending |
| Imported SO101 reference model | Loads and runs; nominal CAD dimensions closely agree |
| Combined reference robot/charger/table | Mac validation; Windows native/reset/relocation acceptance reported at 74cf11a |
| Physical joint mapping / real motion comparison | Unverified; reference evidence needed |
| Fetch public integration / Vultr deployment | Incomplete / deferred |

See [example taxonomy](../examples/README.md), [CAD review](../examples/so101/cad-review/README.md),
[reference workspace](../examples/so101/WORKSPACE.md), and
[implementation plan](superpowers/plans/2026-10-24-articulated-export.md).
Windows 74cf11a is a teammate-reported result; the current checkout need not
contain its evidence files. No measured physical accuracy follows from it.

## Ordered phases and acceptance

### 1. Preserve the rigid foundation — working
- [x] Photo reconstruction, persistent jobs, retries and artifact preservation.
- [x] Explicit properties/provenance, orientation, preview and portable export.
- [x] Cleaned real charger API/Windows acceptance and synthetic fixtures.
- [ ] Measure physical properties where needed; estimated values stay labeled.

### 2. Add reusable articulated representation — first version implemented
- [x] Versioned links/joints, frames, limits and per-link properties/provenance.
- [x] Validate graph, geometry references, units and physical inputs.
- [x] Keep SO101-specific geometry and parameters in data, not product code.

### 3. Prove generated articulation — local checks passed
- [x] Two prepared links + one reviewed joint → generated MuJoCo bundle.
- [x] Verify FK, actual controlled motion, limits, reset, warnings and relocation.
- [x] Keep this synthetic engineering fixture distinct from photo conversion.

Windows native-viewer acceptance of the new generated fixture remains pending.
See the [two-link proof](../examples/assemblies/two-link-hinge/README.md).

### 4. Build guided assembly preparation and review — local slice implemented
- [x] Import optional CAD component geometry; group components into rigid links.
- [ ] Add photo-based part proposals or user-provided part meshes.
- [x] Show link connections, joint axes and motion sliders; permit corrections.
- [x] Save/revise reviewed records, then regenerate without repeating reconstruction.
- [ ] Expose articulated processing through API and UI, retaining failure artifacts.

### 5. Apply the same workflow to the SO101 — CAD/template candidate generated
- [x] Process 11 supplied CAD components through reusable assembly tools.
- [ ] Review joint frames, limits, gripper relationship and physical assumptions.
- [x] Record which data came from photos, CAD, measurements or imported reference.
- [x] Generate a new articulated export; compare frames with the reference separately.
- [x] Resolve local free-space SO101 tracking with convex hulls and explicit adjacent-pair exclusions.
- [ ] Accept revised scene on Windows and replace assumed clearance with measured physical placement.
See [collision revision](../examples/assemblies/so101-guided/collision-revision/README.md); the original low-root candidate remains a recorded failure.
CAD may be required for this first demonstration. Photos-only robot conversion
is not yet proven. Reusing a template must be labeled template-assisted.

### 6. Compare with the physical arm
- [ ] Match timestamped whole-arm images and joint observations in several poses.
- [ ] Verify signs/zeros/gripper mapping and measured base/table placement.
- [ ] Compare observation replay (kinematics) before commanded-motion prediction.
- [ ] Compare one operator-controlled action, retaining actual sent/clipped targets.
- [ ] Show discrepancies and one useful input correction/regeneration cycle.
Physical calibration is demo evidence, not a prerequisite for developing generic
assembly export. Visual resemblance is not dynamics validation.

### 7. Polish, sponsor integrations and submission
- [ ] Package an end-to-end demo, cached backup and explicit supported scope.
- [ ] Document processing effort, manual interventions and remaining uncertainty.
- [ ] Complete Fetch public integration if feasible; revisit Vultr when accessible.
- [ ] Verify sponsor eligibility and submit actual implemented integrations.
Sponsor targets remain Fetch.ai, Vultr and Gemini API; regular targets remain
Overall, Most Technically Advanced and Most Creative, subject to current rules.
See [sponsor checklist](SPONSORS.md). No new eligibility verification is claimed here.

## Work allocation now
- **Johaan + this agent:** product integration, assembly schema/export and synthetic
  proof, guided review and SO101 free-space motion implemented locally. Next:
  physical mapping integration and complete assembly HTTP processing.
- **Atul, proposed handoff:** assembly jobs/API and frontend wiring; see
  [scoped instructions](handoffs/atul-assembly-jobs.md). Assignment is pending Johaan sending it.
- **Yash + Windows agent:** physical reference evidence and independent Windows
  acceptance. Follow [updated instructions](handoffs/yash-articulated-demo.md).
- No repeat Meshy job, charger drop test or broad reference-model rewrite is needed.

## Infrastructure and evidence discipline
Keep FastAPI, Pydantic, SQLite/local artifacts, Meshy, Gemini, trimesh/NumPy and
MuJoCo. The current rigid AssetRecord/API stays compatible; articulated records
are separate until a deliberate API integration. Python simulation dependencies
remain separate from LeRobot. Optional CAD dependencies remain isolated.

Preserve historical handoffs, source branches and examples. Clearly label
synthetic fixtures, generated exports, imported reference models, observations,
and estimates. Keep secrets/raw large captures out of Git. No scope claim should
outpace tested evidence. Main remains separate from feature integration.

Current guided slice: [workflow](GUIDED_ASSEMBLIES.md) and [SO101 evidence](../examples/assemblies/so101-guided/README.md). The workbench is local-file based; no automatic photo articulation or hardware dynamics validation is claimed.
