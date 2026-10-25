# Reviewed assembly format and export (assembly-1.0)

This **local library/CLI** is separate from the rigid AssetRecord v1 and its job
API. A [local guided workbench and optional STEP import/grouping](GUIDED_ASSEMBLIES.md)
now precede this exporter. HTTP assembly jobs and photo-based part inference
remain future work. The format contains reviewed input data and provenance,
not an assertion that articulation was inferred correctly.

See the [minimal example](../examples/assemblies/two-link-hinge/input/assembly.json)
and [working export](../examples/assemblies/two-link-hinge/README.md).

## Data model
- Assembly: name, synthetic flag, root link, root pose, links, joints and notes.
- Link: unique name, relative geometry-only OBJ/STL, geometry source/note, mass
  with provenance, optional sliding friction with provenance.
- Joint: unique name, parent/child, fixed or revolute, origin pose, source/note.
  Revolute joints additionally require a unit axis, finite ordered limits
  including zero, damping, and a position drive with positive gain/torque limit.
- Graph: one fixed root, connected acyclic tree; every other link has exactly
  one parent. No floating bases, closed loops, prismatic or coupled joints yet.

All positions/vertices are **metres**, angles and position-control inputs are
**radians**, axes are right-handed and unit length. A quaternion is **w,x,y,z**
and unit length. Joint origin transforms child coordinates into parent coordinates
at q=0. The hinge passes through the child origin; its axis is expressed in that
child frame. Mesh vertices are already in local link coordinates: **the exporter
never fits scale, recentres, or infers frames**. Root pose maps root coordinates
to world. Pose corrections must transform the mesh and joint definitions
consistently upstream.

Position drive: torque = kp × (target − angle), saturated by force_limit_nm;
kp has units Nm/rad. Joint damping is Nm·s/rad. These parameters are supplied,
not inferred from photos. Physical motor dynamics require separate calibration.

Every reviewed value uses existing `measured`, `user_supplied`, `sourced`, or
`estimated` provenance. Joint `source`/`note` cover frame, axis and limits; drive,
damping and link mass/friction have independent provenance. Root pose provenance
and any broader qualifications should be recorded in assembly notes in this first
version. `synthetic` is explicit and preserved.

## Public interfaces
```python
from photo2sim.assemblies.contracts import AssemblyRecord
from photo2sim.assemblies.export import export_assembly
from photo2sim.assemblies.validate import validate_assembly

record = AssemblyRecord.model_validate_json(record_path.read_text())
scene = export_assembly(record, record_path.parent, new_output_directory)
report = validate_assembly(scene)
```

Output: `scene.xml`, `assembly.json`, `simulation.json`, copied relative mesh
files. The CLI additionally saves `validation.json`. Records and paths are
preserved so the portable bundle can also be re-exported after review. Do not
change input record/mesh contents concurrently with export. Export resolves input
paths, rejects outside symlinks and external OBJ materials, compiles in a temporary
staging folder and publishes only after a successful load. Existing outputs are
preserved. Simulation validation failures remain available for inspection.

## Explicit approximations and validation scope
By default, each link's visual mesh is separate from its box collision proxy. Collision and
uniform-solid-box inertia are derived from the local mesh bounding box, including
its offset from the hinge. Centre of mass is assumed at the box centre. This is
not mass-distribution estimation. Unknown sliding friction stays null in the
record; a simulator default of 0.8 is documented in simulation.json. Gravity,
timestep, contact settings and source mesh hashes are recorded there too.

Motion validation exercises each hinge separately with all others commanded to
zero: half its upper limit, half its lower limit, then zero, two seconds per phase.
It repeats from reset and runs a relocated copy. Compiled-model checks verify reviewed body/joint frames, hierarchy, mesh bounds and
hashes, mass/inertia, collision proxies, gravity, drives and limits. Motion checks
cover finite states,
MuJoCo/Python warnings, motion excursion, final tracking, joint-limit excursions
and reset repeatability. It does not prove physical fidelity, collision coverage,
whole-workspace reachability or controller suitability for all assemblies. Fixed-only
exports can load but receive an explicit unsupported-motion-check result.

Frame conventions follow [MuJoCo coordinate frames](https://mujoco.readthedocs.io/en/3.3.7/modeling.html#coordinate-frames)
and [MJCF joints/actuators](https://mujoco.readthedocs.io/en/3.3.7/XMLreference.html).

## Optional convex collision policy
The default export remains per-link boxes with native MuJoCo filtering. For
closer convex shape coverage, use `export_assembly(..., collision_mode="convex_mesh",
exclude_joint_pairs=True)` or CLI `--collision-mode convex_mesh --exclude-joint-pairs`.
The convex hull uses the same local visual mesh; visual geometry, mass and the
explicit approximate cuboid inertia stay unchanged. Concavities are filled, so
this is still unsuitable for exact holes, insertion or detailed grasp contact.

The second option explicitly excludes only directly joint-connected body pairs,
including children of the fixed root. Native MuJoCo filtering treats static
bodies as world-welded and may otherwise contact those children. Ground and
nonadjacent self contacts remain enabled. Export options and exact excluded pairs
are recorded in simulation.json; repeat these options when re-exporting a bundle.
The validator checks masks, global contact enablement, ground, exact exclusions
and collision transforms in addition to the existing motion limits.

[MuJoCo collision filtering and convex hulls](https://mujoco.readthedocs.io/en/3.3.7/computation/index.html#collision-detection).
A passing free-space motion test does not prove mounting clearance or hardware
accuracy; the environment must match the intended physical comparison.

## Scripted simulation replay
A portable export can be exercised without the frontend or hardware:

```sh
python -m photo2sim.assemblies.motion PATH/scene.xml actions.json --output-dir outputs/new-replay --render
```

`actions.json` is a list of phases, for example for the synthetic hinge:

```json
[
  {"duration_s": 2, "targets_rad": {"hinge": 0.4}},
  {"duration_s": 2, "targets_rad": {"hinge": -0.4}},
  {"duration_s": 2, "targets_rad": {"hinge": 0.0}}
]
```

Every phase must specify every driven joint. Names and radians follow the reviewed
assembly. Out-of-limit targets are rejected, never clipped. Durations must be
positive; total requested duration is limited to 60 seconds. Each duration rounds
up to simulation timesteps, recorded in the trace. Targets are piecewise constant,
not a trajectory planner, and are never sent to physical motors.

The scene first passes existing motion/model validation. A fresh simulation then
runs actual actuator dynamics, storing `trace.json` (time, targets, observed joint
positions), `report.json` (phase-end tracking, limits, warnings and assumptions),
`actions.json` and `preflight.json`. A missed target yields exit 1 and retains the
trace/report. Invalid input or failed preflight does not start the requested action.
Existing output directories and symlinks are preserved. Source exports must stay
unchanged during execution. The record's original property provenance is preserved
in its source bundle; this report is additional demo evidence, not a replacement.

`--render` also saves `replay.gif`; omit it for machines without graphics support.
A rendering failure retains a failed report. The GIF is an offscreen simulation
with approximate timing; JSON timestamps are authoritative. Looping restarts the
recorded simulation. Physical accuracy, collision fidelity and hardware mapping
are not established by tracking success. This module is independent of HTTP jobs.
