# Operator measurement/camera follow-up — 2026-10-24

This packet supplements take 3 without altering its original data/photos or
operator-confirmed stationary pairing. No new motor reads, commands, torque
changes or recalibration occurred.

## Camera clarification

Yash confirms BOTH original take-3 images used the REAR camera and neither was
flipped left-to-right in the camera or editing app. Front-facing image is portrait;
left-side image is landscape. This resolves mirror history by OPERATOR REPORT,
not independent optical calibration. Portrait/landscape is unrelated to mirroring.
Original images were not transformed. Joint signs/zeros are still unverified.
Earlier candidate render comparison.json records mirror status at generation time
as unknown; model-comparison/operator-review.json and this packet supply the later
operator confirmation. No simulated candidate was fitted or selected because of it.

## Measurements and endpoint clarification

Initial report was 77.8 mm (3 1/16 inches) to an unspecified reference near the base.
Yash then clarified **2.97 inches from tabletop to the BOTTOM of the black bar**.
This converts to 75.438 mm, sensibly reported as **approximately 75.4 mm**. This
arithmetic does not establish 0.001 mm measurement accuracy. Uncertainty unknown.
The initial report is retained in measurements.json as prior_report; it is not
used to infer bar thickness or a model offset.

The bar's identity/attachment is still unknown. A tabletop-to-bar height is not
yet a tabletop-to-model-root height. Identify the bar and its exact fixed CAD/model
point before converting this measurement. If the bar is an unmodeled clamp rail
or separate tool, it is not automatically an arm reference. A marked point on the
fixed printed base or a clearly identifiable screw/horn centre can work; a joint
axis is not mandatory when another fixed CAD point is known. No further arm
movement is needed simply to identify a visible reference.

Reported jaw gap: approximately **3.18 mm (1/8 inch)** between closest opposing
inner gripping faces (about 3.2 mm). No jaw measurement photo was supplied.

## Pose continuity and calibration use

Yash manually moved the shoulder temporarily to access the gripper. No code moved
it, but continuity of the complete take-3 pose is nevertheless broken. Whether it
returned exactly is unknown. These follow-up photos are NOT paired with the old
joint values. The earlier original take-3 association remains valid as reported
for that earlier interval; it was not relabeled synchronized.

When asked whether the jaws themselves stayed unchanged, Yash answered **'Not
sure'**. Therefore the 3.18 mm gap is a later, unpaired measurement and MUST NOT be
used as a calibration point for take-3 gripper=0.95497954. It does not select either
candidate gripper conversion. Joint signs/zeros, gripper conversion, metric camera
mounting and full base/world transform remain unverified.

Two original measurement PNGs are preserved byte-for-byte, with hashes/dimensions
in measurements.json. The overview supplies clamp/bar context and the second image
shows the tape. Zero alignment, parallax and exact endpoint were not independently
measured from pixels; values are operator-measured approximate reports.

## Remaining limitation

The only remaining endpoint clarification is what the bar is attached to and
whether a corresponding fixed CAD point exists. Even a mapped vertical height
alone does not supply base XY, yaw or full table plane orientation. The **0.15 m
simulation root remains an assumed free-space test placement**. It was not changed
to 0.0754 m, and no simulator/hardware parameters were changed.
