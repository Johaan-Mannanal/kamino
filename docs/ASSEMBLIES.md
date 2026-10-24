# Reviewed assembly format and export (assembly-1.0)

This **local library/CLI** is separate from the rigid AssetRecord v1 and its job
API. Frontend/API integration, optional CAD import/grouping and photo-based part
inference are future work. The format contains reviewed input data and provenance,
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
Each link's visual mesh is separate from its box collision proxy. Collision and
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
