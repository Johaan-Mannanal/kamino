# Stationary SO101 take 2 — incomplete physical pose pairing

Original capture.json, calibration.json, observations.jsonl and summary.json were
copied byte-for-byte from Yash's pushed commit
`efa71da80f64be707209fff8396ad0e2171d88fd`, branch
`codex/windows-simulation-setup`. Other Windows branch changes were not merged.
Original metadata reports read-only collection and no servo writes; this Mac did
not contact hardware. No photos or operator stationary confirmation accompanied
these files. Do not mark the capture physically paired or calibrated.

## Independent offline audit
`offline-audit.json` hashes all three audited inputs, verifies calibration metadata
and sample count, rejects nonfinite/missing signals and invalid timestamp ordering,
and summarizes readings in their declared units. It does not accept summary.json assertions
as physical proof. Source files remain unchanged.

599 samples span 119.839 seconds, approximately 4.99 Hz. Shoulder-pan span is
0.263736 degrees; other recorded signals are constant. Gripper remains normalized
0–100, not degrees/radians. Low variation is not independent evidence that images
correspond to this capture. All simulation mapping fields remain null for review.

```sh
python -m photo2sim.simulation.pose_review examples/so101/windows/reference-20261024-take2 --report outputs/so101/new-audit.json
```

The report path must be new. This command only reads local files. It imports no
robot/serial library, sends no commands, and does not change source evidence.

## Next evidence
Associate front and side whole-arm photos with this take only if the operator
can confirm the arm stayed in the same pose between capture and photographs.
Record times, method and confirmation; this is stationary association, not
hardware camera synchronization. Otherwise preserve take 2 as unpaired and make
a new explicitly paired take using the existing operator workflow. Distinct
paired poses are later needed to resolve signs/offsets; record jaw opening and
base/table measurements separately. Do not fit or validate motor dynamics from
this stationary sequence.

The scoped .gitattributes preserves raw capture bytes across platforms, including
calibration.json's original CRLF endings. The offline audit plus existing SO101
inspection tests passed locally (21 tests); no Windows execution is claimed here.

Unit declarations are not independently verified by the generic audit. For this
take, the inspected Windows producer at efa71da declares the first five joints
as degrees and gripper as normalized 0–100; the saved metadata agrees. Altering
the unit labels in arbitrary metadata is not detected without that producer check.
