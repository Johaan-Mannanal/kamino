# Guided part grouping and joint review

This local workflow turns supplied component meshes into editable rigid links and
reviewed joints, then uses the generic assembly exporter. The browser is at
`/assembly.html` in the existing Vite app. Import the review project JSON and
its original OBJ/STL source meshes to create a persistent HTTP job, or open a
saved job by ID. Photo-based part segmentation is not implemented. The rigid-object
app stays separate.

## Workflow
1. Supply geometry-only OBJ/STL parts in metres and an `assembly-review-1.0`
   project. Each part has a relative path, SHA-256, provenance and placement in a
   common reference frame. Optional STEP import is described below.
2. Run `python -m photo2sim.assemblies package PATH/project.json --output NEW/review-package.json`.
3. Open the package in the browser. Assign every part to a rigid link, or record
   an explicit exclusion. Colors distinguish groups. Change group pivots and
   joint parameters with the form; advanced JSON permits adding/removing groups
   and joints. Imported part IDs, paths, hashes and provenance are locked;
   repackage changed source files instead.
4. Inspect the hierarchy, yellow joint axes and sliders. Sliders are **kinematic**;
   they neither simulate forces nor test collisions. The review requires a connected
   tree with one fixed root. Each movable joint is revolute; fixed joints are also
   supported. Coupled, prismatic and closed-loop mechanisms are not supported.
5. Apply edits, write review notes and acknowledge each link/joint. All input
   edits invalidate earlier acknowledgements. A semantic snapshot also rejects
   externally edited stale approvals at preparation time. This is a consistency
   guard, not a signed approval or physical certification.
6. Save the reviewed revision in the job, then run preparation, export and
   validation from the workbench. The job shows **export generated** separately
   from **motion validation passed**. Download the result ZIP only after a pass;
   failed reports and exports remain downloadable from previous attempts.
   Offline review package and project downloads remain available.
7. The CLI remains available: `python -m photo2sim.assemblies prepare PATH/reviewed-project.json --output-dir NEW/prepared`,
   then `python -m photo2sim.assemblies export NEW/prepared/assembly.json --output-dir NEW/bundle`.
   A failed motion check returns exit 1 and retains the bundle/report.

Every command requires a new output path. Previous attempts and source meshes
remain intact. A reviewed JSON can be authored programmatically, but the caller
must deliberately renew every review and its `review_snapshot` after changes.
The Python helper `review_snapshot(project)` captures the current semantic input.

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
