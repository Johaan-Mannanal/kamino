# Take 5: second-pose diagnostic comparison

Windows evidence comes from `3ec35e6b50e32c6e4bb4d84d2500e467e1dfe7de`.
Original files were imported byte-for-byte into
`../../windows/reference-20261024-take5/`. All ten entries in its integrity
manifest passed SHA-256 and size checks. The capture audit passed for all 599
observations; calibration hashes agree with take 3. No hardware was accessed.

See [comparison](comparison.jpg) and [machine-readable report](report.json).
The comparison uses the same API-export fixture and unverified conversion as
take 3: positive signs, zero offsets, degrees to radians for the five arm joints.
Gripper angle remains a display-only zero placeholder. No fit, clamping, limit
changes, dynamics steps, or calibration changes were performed.

## Findings

- Shoulder lift changed +42.9011 degrees and wrist flex -82.8132 degrees.
  Wrist roll also changed -8.6154 degrees; pan and elbow changed slightly.
  This is not an isolated single-joint experiment.
- All five arm angles fall inside the existing model limits in take 5.
  Take 3's shoulder range discrepancy is still unresolved.
- The broad folded posture is recognizable in the baseline render, but the
  wrist/gripper orientation appears different from the photograph. This is a
  qualitative observation, not a measured angular error or a verified diagnosis
  of which sign/offset is wrong. Camera projection and missing hardware geometry
  confound direct comparison.
- The approximately 3.175 mm jaw measurement is associated with take 5 by
  operator confirmation. Its uncertainty and exact measuring points remain
  unspecified. One point cannot determine the gripper conversion.
- Front/side pairing is operator-confirmed, not synchronized. Take-5 horizontal
  mirroring has not been confirmed independently. Photos were only resized in
  the comparison sheet; source pixels/files are preserved.

The four cardinal render viewpoints are illustrative, not calibrated to the
photographs. The source model keeps its free-space base height, approximate
geometry, and missing servos/camera/wiring/clamps. Numerical plausibility does
not establish a physically accurate export or actuator dynamics.

## Next evidence from Windows

1. Confirm whether both take-5 photographs are unmirrored rear-camera images.
2. Using only the operator's established controls, obtain a small wrist-flex-only
   pose change, keeping the other joints as steady as practical. Pair front/side
   photographs with a stationary observation capture. Log actual changes in all
   readings; do not assume the other joints stayed fixed.
3. A separate shoulder-only reference and a second paired jaw opening with the
   same identified measuring points will help distinguish independent mappings.
   Do not reuse the unpaired take-3 jaw measurement.

These are requests for coordinated operator reference captures, not authorization
for an agent to command simulated targets, alter torque, recalibrate, or change
servo zeros. Avoid another multi-joint pose change before the isolated wrist
reference. No repeated charger reconstruction or drop test is needed.

## Reproduce

From the repository root with the simulation environment and graphics access:

```sh
python tools/so101/compare_take5.py --output-dir outputs/so101-take5-new
```

Use a new output directory. The script verifies original evidence, compares
take-3 statistics, extracts the reviewed API bundle, and writes four static FK
views and a report. This run used MuJoCo 3.3.7 on the Intel Mac; it does not claim
a new Windows simulation or native-viewer acceptance.
