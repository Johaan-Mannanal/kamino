# SO101 saved-job workflow — CAD/template-assisted

> Historical artifact scope: this page describes the specific earlier export or replay retained here. Kamino’s broader prototype also demonstrated leader-recorded motion refined in simulation, exported and executed on the physical SO-101 follower arm, with iteration between simulation and hardware. See [the current robotics account](../../../../docs/ROBOTICS_DEMO.md). Precise calibration and contact-rich manipulation remain ongoing work.

The accepted free-space SO101 candidate passed the real browser/API workflow:
source import → guided review → saved revision → preparation/export → motion
validation → authenticated browser ZIP download. This is a generated articulated
model from supplied CAD parts and a reference articulation template. Photos did
not generate its geometry or joints. Physical signs/zeros, mounting and dynamics
remain unverified.

## Input and review

`input-project.json` starts with all 13 acknowledgements cleared. It retains the
11 CAD meshes, their hashes, seven link groups, six joints, sourced physical
parameters and prior review notes. All common-reference part poses and group
frames were translated together +0.10 m from the original candidate, resulting
in the accepted **assumed 0.15 m free-space root height**. No relative shape or
joint arrangement was changed. `input-comparison.json` records the check against
`../collision-revision/input-assembly.json`; only supplementary review/assumption
notes differ, and numerical frame differences are at floating-point roundoff.

The coding agent reviewed/acknowledged all seven links and six joints in the
browser, then saved revision 2. `reviewed-project.json` is that persisted record,
including its semantic review snapshot. These are engineering consistency
acknowledgements, not human measurements or hardware calibration.

The processing request explicitly selected `convex_mesh` and
`exclude_joint_pairs=true`. Source review data and attempt collision policy are
separate. Older source notes mentioning box collision describe the original
candidate/default; `simulation.json` in this export records the active policy.
Uniform-box inertia, reduced actuator dynamics and omitted servo/fastener/camera
visuals remain approximations. Hulls fill concavities; directly joint-connected
contacts are excluded. Ground and nonadjacent self contacts stay enabled.

## Verified outcome

- `simulation.zip` is the **actual browser-downloaded API archive**, copied without
  modification. Its 31,253,228 bytes match the backend's saved bundle exactly;
  SHA-256 is in `acceptance.json`. It contains the scene, prepared audit record,
  source meshes and report; no application/provider credentials.
- `api-validation.json`: original and relocated motion checks pass. All six joints
  exercise positive/negative half-limit targets and return to zero, twice from
  reset. Maximum final tracking error **0.0006168732 rad**, unchanged tolerance
  **0.03 rad**; timestep **0.001 s**, no joint-limit violations or warnings.
- `download-validation.json`: separate fresh validation of the extracted browser
  download and another relocation passes with the same result.
- Grouped mesh faces and vertices match the previously accepted collision
  candidate exactly. Source-part hashes are preserved.
- `template-check.json`: three poses match the pinned reference to 2.50e-16 m
  maximum body-position error. This checks conversion against the same template,
  not independent real-world accuracy.
- Job reopened in the browser after backend restart with revision 2, all reviews
  and completed attempt retained. Authenticated ZIP bytes unchanged; anonymous
  download returned 401. No browser console errors or warnings.
- Screenshots: `browser-completed.png` and `browser-review.png`.
- `motion-demo/replay.gif` is a fresh 8-second scripted simulation of the extracted
  API export. Its trace records actual simulated joints; maximum phase-end error
  is 0.000500117 rad, zero warnings. It is labeled simulated motion with assumed
  mounting/dynamics. This is an offscreen replay, not native-viewer or real-arm footage.

Runtime: Python 3.13.7, MuJoCo 3.3.7, NumPy 2.5.4, trimesh 5.2.0, Vite 7.3.7.
Application code: `45b4ce309ad8c5770b255f0da94a694e109d7dc9`.
Windows 3.17 native-viewer/physics acceptance of this exact ZIP remains pending.
No new reconstruction, API credit use, cloud deployment or robot command occurred.

## Reproduce in the browser

1. Install the repo's `.[dev,simulation]` extras and locked frontend dependencies.
2. Extract `../input/meshes.zip` into a **new** source directory. Its paths start
   with `meshes/`; keep those names. Do not upload the ZIP itself.
3. Start the backend with a separate `PHOTO2SIM_DATA_DIR`, application token,
   `PHOTO2SIM_PROVIDER=mock`, and a CORS origin matching the frontend. Start Vite
   with `VITE_API_BASE_URL` pointing to that backend. Open `/assembly.html`.
4. Set the application token using API access. Import `input-project.json` and
   choose the extracted source directory using **Source mesh folder**.
5. Review all 7 links/6 joints, retaining provenance and explicit assumptions.
   Acknowledge each and save the revision. This should produce revision 2.
6. Select **Convex mesh** and **Exclude direct parent-child collision pairs**.
   Run preparation/export/validation; wait for completed and motion pass.
7. Download Result ZIP. Extract elsewhere and run the commands below. New jobs
   have new IDs; the ID in `acceptance.json` belongs to this local test only.

## Validate the portable download

From the repository root, using the simulation interpreter and a new output path:

```sh
python -m zipfile -e examples/assemblies/so101-guided/api-workflow/simulation.zip outputs/so101-api-check
python -m photo2sim.assemblies validate outputs/so101-api-check/scene.xml --report outputs/so101-api-check-validation.json
python tools/assemblies/check_so101_template.py outputs/so101-api-check/scene.xml --root-z-offset 0.15 --report outputs/so101-api-check-template.json
```

For the existing scripted simulation sequence (never send these targets directly
to the physical arm):

```sh
python -m photo2sim.assemblies.motion outputs/so101-api-check/scene.xml examples/assemblies/so101-guided/collision-revision/demo-actions.json --output-dir outputs/so101-api-check-motion --render
```
