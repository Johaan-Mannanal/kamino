# Offline wrist mapping: two stationary endpoints

The photo-paired baseline is `wrist-baseline-20261024-155719` (photos 1–2).
Changed is `wrist-changed-20261024-160156` (photos 3–4). Yash confirms the arm and
jaws stayed unchanged between each capture and its photos. The 15:52 baseline
is preserved and audited as an alternative; it is not substituted into this
photo comparison. Evidence source commit:
`cea2e95b2b6c028162c2e4e983e75150bf3c2982`.

## Views and reproduction

- [Paired photographs](paired-photos.jpg)
- [Whole-arm candidates](whole-arm-candidates.jpg): four rows A–D; each row has
  baseline azimuth 0/90, then changed azimuth 0/90. Same cameras for every state.
- [Wrist relative to forearm](forearm-candidates.jpg): baseline left, changed
  right. The lower-arm frame is fixed at identity for every view.
- [Machine-readable transforms, audits and assessment](report.json)
- [Reproduction script](../../../../tools/so101/compare_wrist_endpoints.py)

From the repository root with the simulation environment:

```powershell
& .\.venv-sim\Scripts\python.exe -B tools\so101\compare_wrist_endpoints.py --output-dir outputs\wrist-endpoints-new
```

Use a fresh directory. The script audits saved evidence, extracts the existing
API bundle, applies FK and renders endpoints. It imports no hardware-control
modules. No serial port, wrist helper, trajectory interpolation, dynamics steps,
contact accuracy test, clipping or limit edits are involved. The complete
assessments in this README/report are editorial review of generated views, not
an automatic camera fit or an automated pass/fail calibration result.

## Every measured change is included

| Signal | Changed minus paired baseline | Unit |
|---|---:|---|
| shoulder_pan | -1.582418 | degrees |
| shoulder_lift | 0.000000 | degrees |
| elbow_flex | +9.142857 | degrees |
| wrist_flex | +14.241758 | degrees |
| wrist_roll | 0.000000 | degrees |
| gripper | -0.204638 | normalized 0–100 |

Each capture has 50 samples. Calibration SHA-256 agrees across all three:
`17db9518c585eec7fd5a28a436699c9824355e22816ccb9488d1ee6dc9682237`.
The capture auditor's generic flags remain distinct from the separately recorded
operator pairing. The generic auditor alone does not certify photo association.

The whole-arm states use each pose's medians, including elbow and pan changes.
The four other arm-joint mappings stay +sign/zero-offset in every candidate;
those are assumptions, not verified results.

## Candidate equations and results

Let `u` be the saved wrist-flex observation in degrees and `q` the model angle.
Exactly the same equation is used at both endpoints. The +/-90-degree offsets
are illustrative convention-sensitivity probes, not fitted or exhaustive.

| Candidate | Equation | q baseline | q changed | Wrist/forearm signed delta | World gripper rotation magnitude |
|---|---|---:|---:|---:|---:|
| A | q = u | +52.659341° | +66.901099° | +14.241758° | 23.437351° |
| B | q = -u | -52.659341° | -66.901099° | -14.241758° | 5.338650° |
| C | q = u - 90° | -37.340659° | -23.098901° | +14.241758° | 23.437351° |
| D | q = -u + 90° | +37.340659° | +23.098901° | -14.241758° | 5.338650° |

World rotation is the SO(3) angle of the model's rigid gripper body across the
endpoints, including all recorded arm changes. It is a model prediction, not
an angle measured from the photographs or a jaw-opening measurement.

All four candidates have the same shoulder-lift conflict: observation/model
angle -103.912088° versus model lower limit -100.000003°, excess **3.912085°**
in both poses. It is retained in FK and shown in every whole-arm view.
None of these four wrist candidates exceeds the wrist's approximately +/-95°
model range. Thus a claim that any candidate is fully limit-consistent is
ruled out; this is not grounds for clipping or correcting calibration.

## Consistent forearm frame

Use `lower_arm` as the parent frame F, `wrist` as W. With world body transforms,
compute `T_FW = inverse(T_world_F) @ T_world_W` for each pose. The local view
rigidly repositions the root so F has identity orientation and location
[0,0,0.35] m; qpos stays unchanged. Upstream links are hidden only in that view.
Blue is forearm, purple wrist, green rigid gripper and yellow moving jaw.

The model's fixed parent-to-wrist rotation includes -90° about local Z, so its
frame heading is `q - 90°`. Compute relative change from
`R_FW_changed @ transpose(R_FW_baseline)`. It produces +14.241758° for A/C and
-14.241758° for B/D, with no contamination from the elbow or pan change.
The script asserts the local frame identity and signed deltas numerically.

Constant wrist offsets cancel from endpoint-relative rotation: these readings
cannot identify an offset from delta alone. A/C share the same local delta but
have different absolute poses; the same holds for B/D. This is the strongest
frame-consistent result, conditional on each sign hypothesis.

## Gripper display and photograph comparison

Gripper observations remain normalized units in the data and delta table.
To display both endpoints, the yellow jaw uses the explicitly unverified
heuristic `q_jaw = model_min + observation / 100 * (model_max - model_min)`.
Its resulting -0.225102° displayed change is a consequence of that arbitrary
policy, not a measured conversion. A sensitivity check resets the jaw display
to zero and confirms the forearm-to-wrist transform is unchanged in all eight
states. Do not use the yellow jaw to identify wrist sign or jaw opening.

The supplied side photographs show a folded arm and a distal assembly extending
outward/downward from the wrist. A is broadly plausible under the shared
upstream/root assumptions. B/C project the rigid distal assembly mostly upward
in the model side view and are qualitatively less consistent under those same
assumptions; D is nearer horizontal. These are conditional visual assessments,
not a fitted ranking or independent elimination of a physical mapping.

Front framing differs, and the two side photos look from opposite sides.
Clockwise/counterclockwise image motion is not a sign test. No intrinsic or
extrinsic camera alignment, silhouette score, angle extraction or physical
accuracy tolerance was fitted. The root retains the scene's assumed 0.15 m
free-space placement, not a measured table transform; the model omits actual
servos, camera and wiring. Mirroring and camera identity for these four photos
remain **unknown** from the available information. Take-3/take-5 confirmations
are not extended to them.

## What this supports and rules out

It supports the observed +14.241758° wrist signal change and a reproducible
comparison of sign/offset hypotheses in a consistent parent frame. A remains a
plausible starting candidate; no mapping is adopted or physically verified.

It rules out treating these endpoints as an observed wrist-only change, treating
world gripper rotation as wrist rotation alone, treating any candidate as free
of model-limit conflicts, and identifying a constant offset from the delta
alone. It does not conclusively rule out either physical wrist sign or uniquely
select a zero. Other arm signs/offsets, gripper conversion and camera/mounting
transforms remain ambiguous. These are two stationary endpoints, not a moving
trajectory. No further hardware motion or new capture is requested.
