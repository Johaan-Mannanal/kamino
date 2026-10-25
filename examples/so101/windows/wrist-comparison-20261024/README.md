# Manual wrist reference: paired before/after evidence

Motion was already performed by Yash through leader teleoperation. The new
relative-motion helper remains unexecuted; no repeat test is requested.

- [Six-joint comparison](wrist-capture-comparison.md) and [JSON](wrist-capture-comparison.json)
- [Pairing/current-state status](pairing.json): photos 1–2 are the later baseline;
  photos 3–4 are changed. Yash confirms the arm and jaws stayed unchanged between
  each capture and its photos. Camera identity, mirroring and current state
  remain unconfirmed. This is stationary operator pairing, not synchronization.
- [Baseline front](photos/baseline-front.png), [baseline side](photos/baseline-side.png),
  [changed front](photos/changed-front.png), [changed side](photos/changed-side.png).
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

All four supplied clipboard PNG attachments are preserved byte-for-byte, including
any existing overlays. They are not asserted to be original phone camera files.
Yash reports wrist flex as the only intentional movement; environmental effects
are his proposed explanation for other movement, not a verified cause. The
observed elbow change remains material and is included in every comparison.

The photos show a wrist-posture difference, with different framing and opposite
side viewpoints. They do not by themselves establish a simulation sign or zero
offset. Use all six observed values for offline model comparison and inspect
wrist orientation relative to its parent link. No repeat hardware test is
requested. All-joint offsets, gripper conversion and current hardware state
remain unverified. New-photo rear-camera use is not inferred from earlier takes.

Take-5 mirroring confirmation is published separately in its original evidence
directory, preserving the explicit lack of rear-camera confirmation.

`integrity.json` hashes all other package files plus the helper files and their scoped Git attributes.
The ZIP alongside local outputs contains the same repository-relative layout.
