# Video grasp-event handoff for Johaan

Source: `Video Demo final.mov`, duration approximately **37.97 s**. Yash confirms
this is **a replay of trajectory-20261024-234032**, the **same reconstruction
charger**, and the **exact starting arrangement intended for the live demo**.
It is not the original teleoperation recording. All times below are VIDEO times.

## Start state

At clip start, the charger stands upright on the marked A paper with pins upward.
The gripper is clear of it; the charger is neither already held nor being touched.
The arm approaches later. This supports a pre-grasp initial arrangement. It does
not identify the exact instant corresponding to trajectory frame zero.

## Approximate visual events

| Event | Video seconds | What is visible |
|---|---|---|
| Fingers around housing / closure | ~17.5–20.0 | Contact geometry partly occluded; exact force/contact onset unknown |
| First lift | ~20.0–20.5 | Object on A at 20.0, visibly off the paper by 20.5 |
| Secure grip demonstrated | By ~20.5; reference screenshot 21.5 | Charger follows gripper through airborne carry |
| Release at B | ~30.0–31.5 | Fingers open; charger remains upright on B as gripper withdraws |
| Retract / return | ~31.5–37.0 | Arm retracts and returns near starting area around 34–37; no claim of exact joint reset |

Times are approximate visual intervals, not contact sensor measurements. The
secure-grip instant while the charger still rests on A cannot be determined
precisely; successful lift demonstrates that a supporting grasp exists by then.

## Contact-face annotation

Open [annotated secure-grip frame](secure-grip-annotated.svg), or inspect the
[unchanged original frame](secure-grip-frame.png), both at about 21.5 video s.
The annotation embeds the unchanged PNG and adds deterministic SVG callouts.
No generated/retouched photographic evidence is used.

The visible near-side finger overlaps the central strip of the charger's near
broad housing face, in the upper/middle body region. Opposing contact behind the
housing is inferred from the held geometry; the exact far face and contact patch
are occluded. The pins are not the visible grip location. No distinct added pad
can be identified; pad presence, material and thickness remain unconfirmed.
Do not turn these visual descriptions into invented metric contact locations.

## Timing and alignment limits

The saved original recording is 900 frames at stored 30 FPS and spans
0–29.966667 s. The supplied video spans about 37.97 s and includes an initial
wait. No shared trigger, start marker or replay-run observation trace is saved.
No constant time offset, time scale or video-frame-to-dataset-frame pairing is
asserted. In particular, do not assign video 21.5 s to dataset frame 645 merely
because both nominal rates are near 30 FPS. The installed replay source still
uses dataset.fps=30 despite the requested --dataset.fps=15 option; actual cadence
was not measured from a console log here.

For grasp alignment, retain action and original observation streams separately.
The recorded gripper observation holds near 12.074 from recording time roughly
15–23 s while its requested action is near 0.421. These are potential numerical
landmarks for Johaan's existing offline investigation, not a synchronized match
to the video or proof of a particular contact event. The observation stream is
from the original recording, not this filmed replay.

## Frozen package and scope

Johaan reports native Mac acceptance of the frozen playback ZIP with SHA-256
`760e340d1002e57d2362e29dd9fee5e76312aac300f63e9e1393b24581f9b77c`
and expected manifest SHA-256
`2c665b219cc5612cd56353c3ac4164202282f92b49a24f3e4ec62eba557741af`.
That establishes player launch/controls separately from physical alignment.
The frozen package and website were not edited or rerun in this review.

All mapping, camera/object transforms and gripper-zero uncertainties remain.
No object attachment, pose correction, timestamp synchronization or unknown
geometry was invented. No hardware run, new filming, calibration change or
simulation-to-arm execution occurred. Yash handles communication with Johaan.
