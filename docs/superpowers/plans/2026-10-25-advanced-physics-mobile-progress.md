# Advanced physics, mobile animation and reconstruction progress

User approved the supplied physics feature plan and requested parallel GPT-6.1 Sol high implementation, review and hosted validation.

Goal: expose genuine saved/exported physics controls without changing omitted historical defaults, restore mobile scroll presentation, and show truthful reconstruction stages/progress.
Architecture: optional shared physics settings on rigid properties and assembly links; separate rigid root placement; prismatic/spring/coupling fields on assembly joints; shared collapsed UI. Preview geometry is kinematic; regenerated MuJoCo handles dynamics.
Stack: existing Python/Pydantic/MuJoCo, TypeScript/Three.js/Vite; no new provider calls.

## Ownership and order

- mobile_animation: homepage animation/mobile CSS/tests, reduced-motion preserved.
- reconstruction_progress: provider/job progress stages, truthful loading display and timer cleanup/tests.
- physics_backend: shared physics schema/helpers, rigid preparation/export/validation/tests.
- assembly_physics: assembly link/joint exporters, controls, preview/validation/tests.
- Master: shared frontend physics panel/types, rigid editing and collision/placement preview; integration, independent review, release.

## Contract and safeguards

Optional `physics`: collision box/convex_hull, optional full box dimensions and local offset; torsional/rolling ScalarProperty; inertia automatic/manual, COM and diagonal moments; contact firm/soft and low/medium/high damping-response presets. Rigid `placement_m` is absolute world body-center XYZ; null retains old drop placement. Omitted settings preserve prior defaults, attempts and ZIPs. Invalid/nonfinite values rejected. Manual inertia is positive and physically valid. Spin/rolling contact dimensions activate deliberately.

Joint additions: prismatic with metre limits and force in N; revolute retains radian limits and Nm; spring stiffness/rest with kind-specific units; coupling driver/ratio/offset with references/cycles/type validation, consistent preview and no conflicting dependent motor.

## Verification sequence

- [ ] Dedicated regression tests for each subsystem, old inputs and save/reopen retention.
- [ ] MuJoCo XML/load and behavioral effect comparisons; relocation and old exports preserved.
- [ ] Full backend and both frontend suites/typechecks/builds; inspect conflicts and schema boundaries.
- [ ] Local real browser: mobile touch/scroll and reduced-motion, geometry overlay/placement, advanced save/reopen/regenerate, assembly sliders/springs/coupling, staged loading with fixtures.
- [ ] Independent source review; fix confirmed issues.
- [ ] Isolated hosted staging with offline fixture data, no paid calls; preserve current production and rollback.
- [ ] Publish/deploy only tested candidate; verify actual hosted behavior and update public documentation.

Limits: presets are solver parameters, not measured restitution. Preview is not live physics. No hardware action or physical calibration claim. No fake progress percentages; indeterminate stage when provider progress stalls/unknown, never ready before assets are downloaded.
