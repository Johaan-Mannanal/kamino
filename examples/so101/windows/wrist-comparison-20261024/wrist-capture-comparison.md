# Saved manual wrist-test comparison

The operator confirms that motion was performed through leader teleoperation. The prepared relative-motion helper has not been executed. This audit accessed saved files only; no serial port was opened.

## Capture identity

- Earlier baseline: `wrist-baseline-20261024-155247`, October 24, 2026, 15:52:49â€“15:52:59 Pacific.
- Later baseline: `wrist-baseline-20261024-155719`, 15:57:22â€“15:57:32 Pacific.
- Changed: `wrist-changed-20261024-160156`, 16:01:59â€“16:02:09 Pacific.

Byte-identical copies of all three captures are under the portable `captures/` directory in this package.

Each capture contains 50 observations. Calibration file hashes match their metadata and the reviewed follower hash; hardware calibration records match the saved files. Sample counts and timestamp ordering pass. Recomputed normalization agrees with every stored joint observation. The later baseline shoulder pan spans one encoder count (0.087912 degrees); all its other joints and all changed-pose joints have constant reported values. This describes reporting resolution, not perfect physical immobility.

## Changed minus later baseline

The operator explicitly confirms that photos 1–2 correspond to this later baseline and photos 3–4 to the changed capture, with arm and jaws unchanged between each capture and its photos. Values are medians of the 50 samples.

| Joint | Baseline | Changed | Delta | Unit |
|---|---:|---:|---:|---|
| shoulder_pan | 5.934066 | 4.351648 | -1.582418 | degrees |
| shoulder_lift | -103.912088 | -103.912088 | +0.000000 | degrees |
| elbow_flex | 76.571429 | 85.714286 | +9.142857 | degrees |
| wrist_flex | 52.659341 | 66.901099 | +14.241758 | degrees |
| wrist_roll | -8.747253 | -8.747253 | +0.000000 | degrees |
| gripper | 0.886767 | 0.682128 | -0.204638 | normalized 0â€“100 |

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

The four supplied clipboard PNGs are now preserved byte-for-byte in `photos/`.
Their capture associations are operator-confirmed in `pairing.json`; no hardware
synchronization is claimed. They are supplied clipboard attachments, not verified
original phone camera files. Image 1 includes an “Image Copied!” overlay.

The operator reports wrist flex as the only intentional movement and suggests
other changes may be environmental. That explanation is preserved as a report,
not a measured cause. The elbow's +9.142857 degree change remains material to the
comparison; it is not replaced by zero or described as mere encoder noise.

Visual inspection: the wrist/gripper/camera assembly has a visibly different
posture across the paired references. Front framing and perspective differ.
The side-oblique views show opposite sides of the arm, so clockwise versus
counterclockwise in their image planes cannot directly identify a joint sign.
No numerical image-angle measurement or camera-aligned model fit was performed.
This supports retaining the captures as wrist-mapping evidence; it does not
establish a model sign/offset correction. The next analysis is offline comparison
using all observed joint changes and a consistent parent-link/model frame.

No further hardware test is requested. Camera identity, mirroring of these new
photos, and current physical state remain unconfirmed. No all-joint offsets,
gripper conversion, exact mounting transform or real dynamics are verified.

Machine-readable results: [wrist-capture-comparison.json](wrist-capture-comparison.json).
