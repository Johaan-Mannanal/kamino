# Manual wrist reference: readings packaged, photo pairing pending

Motion was already performed by Yash through leader teleoperation. The new
relative-motion helper remains unexecuted; no repeat test is requested.

- [Six-joint comparison](wrist-capture-comparison.md) and [JSON](wrist-capture-comparison.json)
- [Pairing/current-state status](pairing.json): four existing photos have not yet
  been located; baseline association, unchanged-pose confirmation, mirroring,
  camera identity and current state remain unconfirmed here.
- [Connection/API audit](connection-audit.md)
- [Helper source](../../../../tools/so101/move_wrist_relative.py),
  [offline tests](../../../../tools/so101/test_move_wrist_relative.py), and
  [operator instructions](../../../../tools/so101/wrist-relative-operator.md)

Both baselines and the changed capture are preserved in `captures/`, with raw
observations, metadata and calibration. Each has 50 samples and the same reviewed
calibration SHA-256:
`17db9518c585eec7fd5a28a436699c9824355e22816ccb9488d1ee6dc9682237`.

The later-baseline comparison shows wrist flex +14.241758 degrees, elbow flex
+9.142857 degrees, pan -1.582418 degrees, shoulder lift and wrist roll unchanged
at reporting resolution, and gripper -0.204638 normalized units. This was not an
isolated wrist move. All six deltas, values and both baseline alternatives are
reported; no data were clamped or calibration changed.

The package is **incomplete for visual wrist mapping** until the existing four
photos and truthful pairing are added. Missing files are not evidence that a
new test is needed. Inspect the saved wrist-to-forearm relationship first;
other-joint movement does not by itself invalidate that comparison. No physical
sign, all-joint offset fit, gripper conversion, or current hardware pose is
verified by this package. Do not infer rear-camera use from earlier takes.

Take-5 mirroring confirmation is published separately in its original evidence
directory, preserving the explicit lack of rear-camera confirmation.

`integrity.json` hashes all other package files plus the three helper files.
The ZIP alongside local outputs contains the same repository-relative layout.
