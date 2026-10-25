# SO101 collision revision — free-space motion scenario

This revision preserves the original failed candidate and changes three explicit
inputs: per-link box collision becomes visual-mesh convex hull collision; directly
joint-connected body pairs are excluded; assumed root height becomes 0.15 m instead
of 0.05 m. It does **not** change masses, approximate inertia, axes, limits, gains,
torque caps, damping, timestep, target sequence, duration or acceptance thresholds.

## Diagnosis
`diagnosis.json` isolates the effects, one 36-second diagnostic sequence per case:
- Original boxes/native filtering: maximum tracking error 0.97446 rad. The fixed
  base and shoulder boxes interpenetrate by ~19 mm and resist shoulder pan.
- Explicit joint-pair exclusions: 0.11068 rad; shoulder pan works, but the gripper
  contacts the ground during the positive shoulder-lift target.
- Convex hulls plus exclusions: 0.05264 rad; less artificial box volume, but the
  requested target still intersects the ground.

`clearance.json` samples the nominal half-limit sweeps at 101 angles per joint.
At the original assumed mounting height, the gripper surface reaches z=-0.01693 m.
The revised **free-space test mounting height** adds 0.10 m clearance. This is an
explicit test-scene assumption, not a measured stand/table height and not a claim
that the original grounded action is reachable. Collision geometry alone cannot
make a target below the ground physically reachable. Ground contacts remain on.

`validation.json` contains the full original+relocated motion, reset and warnings
checks for this revision. `bundle.zip` includes the report and portable scene.
`input-assembly.json` records the changed root pose and provenance. All other
reviewed fields and original source mesh bytes remain unchanged.

Local result: all six joints pass positive/negative half-limit targets and reset,
including relocation. Maximum final tracking error is **0.000617 rad**, below the
unchanged 0.03 rad limit; zero warnings. Template FK still agrees within 2.78e-16 m.
Runtime: MuJoCo 3.3.7 on Mac. Windows 3.17 acceptance remains pending.

## Reproduce
Unzip `bundle.zip` into a new directory, then:

```sh
python -m photo2sim.assemblies validate NEW/scene.xml --report outputs/so101-convex-check.json
python tools/assemblies/check_so101_template.py NEW/scene.xml --root-z-offset 0.15 --report outputs/so101-convex-template.json
```

To re-export, use its `assembly.json` and repeat the explicit collision policy:

```sh
python -m photo2sim.assemblies export NEW/assembly.json --output-dir outputs/so101-convex-export --collision-mode convex_mesh --exclude-joint-pairs
```

This remains CAD/template-assisted, with omitted servo/fastener visuals and
approximate dynamics. Convex hulls fill concavities. Joint-adjacent contact is
excluded, so do not claim prediction of mechanical joint stops or housing
interference. Nonadjacent self/ground contacts remain active. Windows native
viewer and physical comparison acceptance are separate pending checks.

## Verification of this change
Full Python suite: 279 passed, 2 skipped (optional CAD interpreter and ACP module),
with one upstream Starlette/httpx deprecation warning. Six collision-focused tests
cover successful convex motion, ground contact retention and rejected contact or
hull-transform tampering. Lint, formatting and dependency checks pass. The shared
visual/collision rotation regression was reproduced before the inspection fix.
An independent reviewer confirmed the correction with no remaining material issue.
