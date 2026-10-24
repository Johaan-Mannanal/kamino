# Saved manual wrist-test comparison

The operator confirms that motion was performed through leader teleoperation. The prepared relative-motion helper has not been executed. This audit accessed saved files only; no serial port was opened.

## Capture identity

- Earlier baseline: `wrist-baseline-20261024-155247`, October 24, 2026, 15:52:49–15:52:59 Pacific.
- Later baseline: `wrist-baseline-20261024-155719`, 15:57:22–15:57:32 Pacific.
- Changed: `wrist-changed-20261024-160156`, 16:01:59–16:02:09 Pacific.

Byte-identical copies of all three captures are under the portable `captures/` directory in this package.

Each capture contains 50 observations. Calibration file hashes match their metadata and the reviewed follower hash; hardware calibration records match the saved files. Sample counts and timestamp ordering pass. Recomputed normalization agrees with every stored joint observation. The later baseline shoulder pan spans one encoder count (0.087912 degrees); all its other joints and all changed-pose joints have constant reported values. This describes reporting resolution, not perfect physical immobility.

## Changed minus later baseline

The later baseline is selected chronologically, pending identification of which baseline the photos depict. Values are medians of the 50 samples.

| Joint | Baseline | Changed | Delta | Unit |
|---|---:|---:|---:|---|
| shoulder_pan | 5.934066 | 4.351648 | -1.582418 | degrees |
| shoulder_lift | -103.912088 | -103.912088 | +0.000000 | degrees |
| elbow_flex | 76.571429 | 85.714286 | +9.142857 | degrees |
| wrist_flex | 52.659341 | 66.901099 | +14.241758 | degrees |
| wrist_roll | -8.747253 | -8.747253 | +0.000000 | degrees |
| gripper | 0.886767 | 0.682128 | -0.204638 | normalized 0–100 |

## Earlier-baseline alternative

No baseline was silently discarded. Relative to the earlier 15:52 capture, the changed pose has these deltas:

| Joint | Delta |
|---|---:|
| shoulder_pan | +3.252747 |
| shoulder_lift | +0.000000 |
| elbow_flex | +15.560440 |
| wrist_flex | +20.483516 |
| wrist_roll | -2.989011 |
| gripper | +0.272851 |

## Mapping interpretation and missing evidence

The later-baseline comparison establishes a +14.241758 degree wrist-flex observation change. Elbow flex also changed +9.142857 degrees and pan changed -1.582418 degrees; this is not an isolated wrist-only movement. The gripper changed -0.204638 normalized units, not millimetres or degrees. These are endpoint observations, not a log of the targets actually sent during teleoperation.

The additional elbow movement does not automatically invalidate the photos: wrist orientation relative to the adjoining forearm link could still distinguish candidate wrist signs if the wrist hinge and parent link are visible and the poses are correctly paired. It does prevent attributing the total world-space gripper orientation change solely to wrist flex.

The four photos reported by the operator were not found beside the captures, in the inspected repository image files, or in the accessible attachment listings for this and the prior chats. Their pixels have not been inspected in this audit. Which baseline they depict, their unchanged-pose association, camera identity and mirroring remain unverified here. No physical sign or model zero offset is adopted from encoder values alone.

Next step: recover the existing four photos and their baseline/changed associations, then inspect the wrist-to-forearm change and compare the candidate model mappings offline. No repeat hardware test is requested. Only if those existing images cannot expose the wrist relative to its parent link would additional evidence need consideration.

Machine-readable results: [wrist-capture-comparison.json](wrist-capture-comparison.json).
