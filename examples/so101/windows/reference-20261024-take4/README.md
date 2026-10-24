# Take 4 — unpaired repeat, not an accepted new mapping pose

A coordinated read-only capture was started after the operator reported a new
stationary pose ready with controls closed. It completed 599 valid observations
from 2026-10-24T13:32:49.220808Z to 13:34:49.089175Z (06:32:49–06:34:49 Pacific).
Calibration readback matched the preserved file. No servo write, torque change,
calibration or agent-issued motion command occurred; COM5 closed cleanly.

The operator subsequently said no joints were intentionally changed and answered
**'Timing or unchanged pose/jaw opening is uncertain'**. Therefore this take remains
UNPAIRED and is NOT accepted as a distinct stationary reference for signs/offsets.
Stable reported encoders do not override uncertainty about photo/measurement timing.

Two image attachments were supplied, but they are BYTE-IDENTICAL (same SHA-256,
6,723,300 bytes each). One copy is saved as unpaired-oblique.png; pairing.json lists
both received attachment names and the shared hash. This is one oblique viewpoint,
not a front/side pair. No ruler image or independently known image time was received.

The jaw was reported as 'still around 1/8' inch (about 3.2 mm). Unchanged jaw timing
was not confirmed, so this is NOT paired with this take's normalized gripper value
and must not be fitted as a gripper calibration point. The earlier 3.18 mm follow-up
also remains separate from take 3. No further capture was initiated.

## Reported observations

Every signal's min=max=median and reported span is zero over the 599 samples.
The differences below are encoder differences between takes, not independently
measured joint motion or resolved signs.

| Joint | Take-4 median | Difference from take 3 | Unit |
|---|---:|---:|---|
| shoulder_pan | -4.35164835 | -3.95604396 | degrees |
| shoulder_lift | -104.26373626 | -0.08791209 | degrees |
| elbow_flex | 96.26373626 | +0.08791209 | degrees |
| wrist_flex | 87.47252747 | +3.42857143 | degrees |
| wrist_roll | 3.91208791 | -0.26373626 | degrees |
| gripper | 0.88676671 | -0.06821282 | normalized 0–100 |

Source metadata, exact calibration, complete readings and summary are preserved.
The offline audit passes calibration hash, sample completeness and timestamp order;
it does not verify photo association, signs/zeros, jaw distance or physical accuracy.
Scoped .gitattributes preserves source bytes for cross-platform hash auditing.

The valid original reference remains take 3, operator-confirmed stationary
association, not synchronized. Additional intentionally distinct operator-chosen
poses with reliable photo association are still needed. Do not send simulated
diagnostic poses or modify calibration to obtain them.
