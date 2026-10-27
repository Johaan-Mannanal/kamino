# Guided part grouping and joint review

This local workflow turns supplied component meshes into editable rigid links and
reviewed joints, then uses the generic assembly exporter. The browser is at
`/assembly.html` in the existing Vite app. Start with individual OBJ/STL component
meshes; no project JSON is required. Existing project/package imports and opening
a saved job by ID remain available. Photo-based part segmentation is not
implemented. The rigid-object app stays separate. See [local startup](DEMO.md).

## Workflow
1. Under **Start from component meshes**, enter a name, select metres or
   millimetres explicitly, and upload separated geometry-only OBJ/STL parts.
   They must already share one coordinate frame. Original bytes are retained;
   normalized geometry uses metres without centering or rotation. Mark generated
   engineering fixtures synthetic. The initial base has an estimated 0.1 kg
   starting mass; review it before processing.
2. Use **Add a link and connection** to name a link, select its parent and choose
   a fixed, revolute or prismatic connection. Rename links in their editor. Names must start
   with a letter and contain only letters, digits, underscores or hyphens (up to 64).
3. Assign each part to a link, or give an explicit exclusion reason. Set each
   link pivot in the common reference frame and review mass/friction. Edit joint
   names, connections, axes, limits and drive assumptions. Starting values are
   suggestions to review, not measurements. Source IDs, paths, hashes and poses
   are locked; import a new job for changed geometry. Advanced JSON remains
   available for operations not exposed in the forms, such as removing a link.
4. Inspect the hierarchy, yellow joint axes and sliders. Sliders are **kinematic**;
   they neither simulate forces nor test collisions. The review requires a connected
   tree with one fixed root. Moving joints can be revolute hinges or prismatic
   sliders. Review radians for hinges and metres for sliders. Optional springs
   and linked follower motion are supported; a follower uses a same-type driver,
   an explicit ratio/offset and no competing actuator. The mapped driver range
   must fit its limits. Closed-loop link graphs and floating bases are unsupported.
   See [units and linked-motion rules](advanced-physics.md#assembly-sliders-springs-and-linked-motion).
5. Apply edits, write review notes and acknowledge each link/joint. All input
   edits invalidate earlier acknowledgements. A semantic snapshot also rejects
   externally edited stale approvals at preparation time. This is a consistency
   guard, not a signed approval or physical certification.
6. Save the reviewed revision in the job, then run preparation, export and
   validation from the workbench. The job shows **export generated** separately
   from **motion validation passed**. Download the result ZIP only after a pass;
   failed reports and exports remain downloadable from previous attempts. Use
   **Inspect validation** for readable checks and per-joint tracking errors.
   **Review <joint>** opens the current editor, while the report stays associated
   with its original attempt/revision. Failure suggestions are possible causes,
   not an automatic diagnosis.
   Offline review package and project downloads remain available.
7. The CLI remains available: `python -m photo2sim.assemblies prepare PATH/reviewed-project.json --output-dir NEW/prepared`,
   then `python -m photo2sim.assemblies export NEW/prepared/assembly.json --output-dir NEW/bundle`.
   A failed motion check returns exit 1 and retains the bundle/report.

Every command requires a new output path. Previous attempts and source meshes
remain intact. A reviewed JSON can be authored programmatically, but the caller
must deliberately renew every review and its `review_snapshot` after changes.
The Python helper `review_snapshot(project)` captures the current semantic input.

## Existing project imports
Use the advanced project upload with its matching meshes, or generate an offline
package: `python -m photo2sim.assemblies package PATH/project.json --output NEW/review-package.json`.
Open that package in the workbench for offline review. Source meshes in this
existing project format are already in metres.

## Frames
Part `pose` and group `frame` both map local coordinates into the common q=0
reference frame. Positions are metres; quaternions are w,x,y,z. Preparation uses
`inverse(group.frame) @ part.pose`, without resizing geometry. Joint origins
are derived as `inverse(parent.frame) @ child.frame`. Joint axes are unit vectors
in the child frame; limits are radians and contain zero. Edit group frames, not
joint `origin` (which must remain identity in a review project). Reassignment
preserves the reference appearance while changing which link moves the part.

Mass, friction, damping and drive values retain their measured/user-supplied/
sourced/estimated labels. Acknowledging them does not promote estimates to
measurements. The exporter defaults to a single collision box per link and uniform-box inertia.
The workbench also offers visual-mesh convex hull collision and explicit exclusion
of directly joint-connected pairs; each attempt records the selected policy.
These remain approximations, and detailed assemblies can fail motion checks.

Enable **Show collision approximation** to overlay orange collision geometry on
colored visual parts. Boxes enclose all assigned parts in each link's local frame;
convex mode fills concavities and gaps. The overlay follows sliders and reset.
It reflects the current draft and selected export policy, not a historical attempt.
It does not detect collisions, demonstrate clearance or simulate contacts. Empty,
degenerate or overly large hull previews show a warning; convex previews are
omitted above 100,000 source vertices per link. MuJoCo compiles its own hull during
export; inspect that result for final acceptance. Direct parent-child exclusion is
shown in the caption and remains an explicit export choice.

New rigid and assembly exports include `README.md`, `ASSUMPTIONS.md`,
`environment.json`, `requirements.txt` and `run_simulation.py`. The runner requires
only MuJoCo and its dependencies, and resolves the scene beside itself. Headless
mode is a zero-control smoke check, distinct from saved pipeline validation.
See [portable acceptance](../examples/assemblies/portable-review/README.md).

## Optional STEP import
Use an isolated CadQuery/OCP environment; it is not a normal app dependency.
The tested importer uses CadQuery 2.8.0 and OCP 7.9.3.1.1. With this repository's
`src` on PYTHONPATH:

```sh
python -m photo2sim.assemblies.cad input.step --output-dir NEW/parts --names selection.json
```

Omit `--names` to import every nonempty leaf. A selection is a JSON array of exact
leaf names or full assembly paths. Ambiguous names fail. STEP declared units are
converted through a millimetre target to metre meshes and placements; import
records units, tessellation, source hash and omitted leaves. It does not infer
rigid grouping, pivots, link masses or hardware calibration. Start a review
project from that inventory and supply those missing decisions.

See [the SO101 application](../examples/assemblies/so101-guided/README.md) for a
CAD-assisted, explicitly template-assisted example and its retained failure.
See [browser/API acceptance](../examples/assemblies/api-browser-macos/README.md)
for the synthetic import-to-download proof and its limits.

See [hinged-panel browser acceptance](../examples/assemblies/hinged-panel/README.md)
for mesh upload, failed tracking, guided correction and portable download.

## Compare recorded stationary poses

The workbench now includes a generic [capture mapping review](MAPPING_REVIEW.md):
source units, signs, offsets and explicit normalized conversions; one candidate
across multiple poses; unclipped joint-limit findings; and separate downloadable
user-review evidence. It previews kinematics only and does not command hardware.
