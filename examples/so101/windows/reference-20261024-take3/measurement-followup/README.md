# Operator measurement/camera follow-up — 2026-10-24

This packet supplements take 3. It does not replace or alter the stationary
capture, original front/side photographs, or operator-confirmed pairing.
No hardware reading, motion command, torque change or recalibration was performed.

## New operator reports

Both original take-3 photographs used the phone's REAR camera. The portrait image
was front-facing; the landscape image was from the arm's LEFT side. The operator
said they were unrotated. Portrait/landscape orientation is different from a
horizontal left-right mirror operation; explicit flip confirmation is still pending.
No image is automatically flipped and no direction/sign mapping is inferred yet.

Reported approximate measurements:
- Tabletop to reference near base clamp: **77.8 mm (3 1/16 inches)**, approximately
  vertical. Treat as about 78 mm; the decimal reflects inch conversion, not proven
  sub-mm measurement accuracy. Reference is shown near a horizontal black bar.
- Closest opposing inner gripping surfaces: **3.18 mm (1/8 inch)**, about 3.2 mm.
  No jaw-gap measurement photograph was supplied. Measurement uncertainty unknown.

The two supplied original PNGs are copied byte-for-byte with dimensions and SHA-256
in measurements.json. base-reference-overview.png shows the bar and clamp context;
base-tape-reading.png shows the tape at the bar. Tape zero/measurement endpoint and
parallax are not independently established well enough to replace the operator's
reported value with an image-derived measurement.

## Physical pose continuity

The operator clarified that no code moved the arm after take 3, but the SHOULDER
WAS TEMPORARILY MOVED MANUALLY to access the gripper gap. Therefore pose continuity
after take 3 is broken even though no motor command was sent. Whether it was
returned exactly is unknown. These follow-up photographs are NOT newly paired
with the take-3 joint values. The original take-3 photo/observation association
was established earlier and remains operator-confirmed, not synchronized.

The jaw-gap measurement may be useful for take 3 only if the operator can confirm
the jaws themselves retained the same opening despite shoulder repositioning.
That is pending, so applies_to_take3_normalized_reading remains null. Do not use
3.18 mm to fit the normalized-0.95498 observation or choose between the unverified
gripper candidates yet. One opening alone would still not establish a conversion.

## Reference sufficiency / questions pending

77.8 mm is a useful reported height to the shown reference, but cannot yet define
the model root/table transform. Identify exactly which black-bar edge/centre was
the endpoint and what the bar attaches to. A ruler reference on an unmodeled clamp
is not automatically a CAD/model body reference. A clearly identifiable point on
the fixed printed base (marked corner or screw center) is sufficient if its CAD
coordinates are known; a servo-horn center also works if unambiguously identified.
A specific joint-axis measurement is not mandatory when another fixed CAD point
can be identified. Do not move the arm to expose a difficult point unnecessarily.

For base reference B with known model coordinates, a vertical tabletop-to-B height
can constrain root height after accounting for B's model offset and actual base
orientation. It does NOT alone supply table plane orientation, base XY/yaw or a
full world transform. The 0.15 m simulation root is still an assumed free-space
test height and was not replaced by 0.0778 m. No simulator parameters were changed.

Still pending:
1. Explicit left-right flip history for each original take-3 photo.
2. Black bar identity and exact top/bottom/centre endpoint.
3. Whether gripper jaws stayed unchanged during manual shoulder repositioning.

Original camera mounting dimensions/extrinsics, physical CAD revision match,
joint signs/zeros, gripper angle/gap conversion and measurement uncertainty remain
unverified. Structured operator reports, image hashes, missing values and context
are recorded in measurements.json. No numerical simulation pass is implied by
these measurements, and no physical accuracy claim is made.
