# Advanced physics, reconstruction progress and mobile presentation

The **Advanced physics** panel starts collapsed in the photo workspace and assembly
link editor. Save reviewed inputs, then generate a new MuJoCo simulation attempt.
Earlier attempts and downloads remain unchanged. Browser views preview geometry,
collision approximations and placement; assembly sliders move geometry
kinematically. Contact, friction and springs apply in the regenerated simulator,
not as live browser physics.

## Units and frames

All advanced fields use SI units, regardless of the units chosen for the photo
workspace's sizing reference.

| Setting | Units and meaning |
| --- | --- |
| Box size | Full X/Y/Z dimensions in metres, not half extents |
| Collision offset | Local X/Y/Z displacement in metres |
| Initial placement | World X/Y/Z position of the rigid body's centre/frame origin, in metres |
| Centre of mass | Local body-frame X/Y/Z position in metres |
| Diagonal inertia | Ixx, Iyy, Izz about that COM, in kg·m²; axes align with the body frame |
| Sliding friction | Dimensionless coefficient |
| Twist and rolling friction | Metres, following MuJoCo's contact convention |

For a prepared rigid photo asset, the body origin is at the centred mesh's bounding
box centre. **Initial placement is not the bottom of the object and is not a
custom COM position.** The legacy default puts the visual bounding box 0.02 m above the ground; custom
collision dimensions or offsets change its clearance. Manual placement can start
inside the ground; inspect its numerical validation results.

Assembly link pivots retain their reviewed local frames. An assembly collision
offset is relative to the link mesh's bounding box centre. A manually supplied
COM is relative to the link frame itself. Initial assembly placement comes from
the reviewed root/link frames rather than the rigid photo asset's placement field.

## Collision and friction

**Default** retains the historical bounding box for a rigid asset. In the assembly
editor it uses the selected export collision policy. An explicit per-link choice
overrides that policy.

**Box** accepts optional full dimensions and a local offset. Leave all three size
fields blank to use the prepared mesh bounds; entering a size requires all three
positive dimensions. **Convex hull** uses the prepared vertices and fills
concavities and gaps. It does not recover exact contact surfaces. Box dimensions
are not applied to a hull.

Blank twist/rolling fields retain defaults. Explicit coefficients must be finite
and nonnegative; zero is valid. A positive twist coefficient enables MuJoCo
`condim=4`, while positive rolling friction enables `condim=6`. With no overrides,
the historical `condim=3` behavior is retained, so the historical stored twist and
rolling coefficients remain inactive. Rolling-only input sets omitted twist
resistance to zero rather than activating that previously inactive coefficient.

## Inertia and contact response

**Automatic inertia** is a uniform solid bounding cuboid approximation using mass
and collision box dimensions, or prepared bounds when dimensions are omitted.
This remains a cuboid approximation for convex hulls; it does not infer material
density or measured inertia. Its COM follows the collision centre.

**Manual inertia** requires a finite local COM and three positive diagonal
moments. Each moment must be no greater than the sum of the other two:
`Ixx ≤ Iyy + Izz`, and the corresponding Y and Z inequalities. Switching back to
automatic deliberately discards the manual COM and moments. Unchanged saved provenance and notes are retained.

Contact settings are numerical solver presets. Firm/soft choose time constants
of 0.002/0.02 seconds; low/medium/high response choose damping ratios of
1.0/0.7/0.4. **These are not restitution coefficients or measured material
properties.** A numerical pass establishes only the checks stated in its report.
Explicit advanced physics/placement uses a finite-state and exported-parameter
smoke test; upright settling and ground-contact observations are reported without
being acceptance criteria.

## Assembly sliders, springs and linked motion

| Quantity | Revolute hinge | Prismatic slider |
| --- | --- | --- |
| Position, limits and spring rest | Radians | Metres |
| Position gain and spring stiffness | N·m/rad | N/m |
| Damping | N·m·s/rad | N·s/m |
| Drive limit | Torque in N·m | Force in N |

Moving joints require a local unit axis, ordered limits containing `q=0`, and
damping. Independent joints have position drives. Spring stiffness is nonnegative;
its rest position must lie within the joint limits.

A linked follower uses `q_follower = offset + ratio × q_driver`. Both joints must
have the same moving type. Ratios may be positive, negative or zero; offsets use
that joint type's position units. The entire mapped driver range must fit the
follower's limits. Missing drivers, dependency cycles and a competing follower
actuator are rejected. The export uses a joint equality constraint, so simulated
followers can have transient tracking error; motion reports check their residuals
and limits separately from driver commands.

Recorded observations map independent hinge drivers; followers derive from them
and unmapped independent sliders display at zero. Playback runs no dynamics and
establishes no physical calibration. Old snapshots treat newly introduced omitted
and null defaults equally; actual physics, joint or mapping changes invalidate
prior bindings.

## Truthful Meshy progress

Photo upload, submission to Meshy, provider queueing, provider processing, and local
mesh download/preparation are separate stages. Percentages come from provider
observations and are not estimates of remaining time. Missing percentages are
shown as indeterminate. A repeated milestone such as 1% can be a genuine provider
reading; after 30 seconds without advancement, the interface shows an
indeterminate wait, the last reported value and elapsed time rather than inventing
intermediate percentages. Regressive readings remain visible alongside the
highest reported milestone.

Provider completion starts download and GLB verification. Reconstruction reaches
100% only when the local mesh is ready, before separate simulation generation and
validation. Leaving stops watching, while the server job can continue. Status
retries never submit another reconstruction; uncertain submissions require
inspection before deliberate resubmission.

## Mobile animation and reduced motion

The homepage keeps its scroll-driven chapters and progress indicator on small
touch screens, with layout adapted to portrait and landscape viewports. Browser
chrome changes use stable viewport sizing to avoid shifting chapter travel.
With **reduced motion** enabled, the homepage uses a static chapter presentation
and stops its animated viewer loop. These presentation choices do not change
reconstruction or simulation settings.

MuJoCo semantics: [XML reference, version 3.3.7](https://mujoco.readthedocs.io/en/3.3.7/XMLreference.html).
