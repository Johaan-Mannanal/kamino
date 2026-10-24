# Guided articulated conversion: first reusable milestone

## Approved intent
Photo2Sim is conversion middleware for robotics/engineering. Photos and optional
CAD/measurements feed an editable physical model, then a simulator export. The
SO101 is a demonstration input, not hardcoded product logic. Existing rigid-object
conversion remains supported. The user authorized plan cleanup and implementation
of a reusable assembly format plus a two-link/one-joint end-to-end proof.

## Scope of this increment
Accept prepared geometry-only OBJ/STL link meshes in metres and a reviewed JSON
assembly record. Represent a rooted tree of links and fixed/revolute joints,
relative frames, unit joint axes, finite limits, per-link mass/provenance and
explicit position-drive parameters. The root is fixed to the world. Export a
portable MJCF bundle, exercise each driven joint, reset, and revalidate a relocated
copy. Demonstrate with two synthetic links; no claim of photo-derived articulation.

Implementation choice: Python/Pydantic separate from existing AssetRecord v1;
no API/frontend change in this increment. Use right-handed XYZ, metres/radians,
scalar-first unit quaternions. Joint origin maps child link coordinates into parent
at q=0; the hinge is at child origin and its axis is in child coordinates. Link
meshes are already in link coordinates and must not be recentered/rescaled.
Each link has a box collision proxy from its mesh AABB and approximate uniform-box
inertia about that box centre. Explicitly document these assumptions. Unknown
friction remains unknown in the record, with a separate simulator default.

## Acceptance
- Reject duplicate names, invalid paths, disconnected/cyclic or multiply-parented
  graphs, invalid axes/rotations/limits/nonfinite values and invalid geometry.
- Preserve supplied provenance and synthetic labels in portable export.
- Two meshes load as two rigid links with one controllable joint; independent
  forward-kinematics assertions verify origin, orientation and axis semantics.
- Finite dynamic state, no MuJoCo warnings, target tracking, repeatable reset and
  portable original/relocated checks pass for the synthetic example.
- Existing rigid pipeline tests continue passing. No source overwrite or unsafe
  external mesh references. Failed export does not publish a partial bundle.

## Not yet implemented
Automatic part segmentation, photo-to-joint inference, CAD-to-link grouping,
interactive review UI, floating bases, closed loops, prismatic joints, calibrated
motor dynamics, collision decomposition, hardware control and general accuracy
claims. The existing SO101 model remains an imported reference, never relabeled
as generated output. CAD inspection is evidence, not a product import feature.
