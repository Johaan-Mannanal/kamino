# Shoulder-lift calibration zero / model-limit investigation — Windows, 2026-10-24

## Finding

The -104.175824 degree take-3 reading is reproduced EXACTLY by installed LeRobot
normalization and lies inside this arm's stored calibration range. It exceeds the
model's inherited -100 degree limit. The evidence establishes a range/convention
mismatch, **not which calibration or model parameter should be changed**.
No reading was clamped, limit widened, calibration rewritten or mapping adopted.

Merged backend b10b481 for the take-3 comparison. No unchanged API ZIP/charger
validation was repeated. Original take-3 images, readings and operator-confirmed
pairing are untouched. Both original images are confirmed by Yash not to have been
flipped left-right, superseding the comparison README's older pending-mirror note.

## Exact arithmetic and source

Installed LeRobot 0.6.2 / Python 3.12.10, clean source commit
146d8474932c8b566717eb2738ba459337ab71c4. The actual STS3215 definition reports
resolution 4096; checked by constructing a read-only bus object WITHOUT opening
it. Source `_normalize` in src/lerobot/motors/motors_bus.py:915 uses:

`degrees = (Present_Position - (range_min + range_max)/2) * 360/(4096-1)`.

Unlike normalized -100..100 mode, the DEGREES branch does not rescale the measured
range into +/-100 or clamp to it. All take-3 AND take-4 first-five-joint samples
were independently recomputed from saved raw counts and match within 1e-12 degrees.
Calibration SHA-256 remains
17db9518c585eec7fd5a28a436699c9824355e22816ccb9488d1ee6dc9682237.
Hardware calibration readback matched on both captures; source and calibration
were not changed. The parent source commit 297774fca4e3ad0aa34e7425fbf937111637e77b
already used the same midpoint/4095 formula. There is no evidence that this formula
was introduced by the recent rustypot refactor; this does not prove all transport
semantics are identical or validate the original calibration procedure.

For shoulder_lift:
- Stored min/max = **948 / 3342**, midpoint **2145 counts**.
- Corresponding calibrated degree bounds = **-105.230769 / +105.230769 degrees**.
- Take-3 Present_Position = **960**: (960-2145)*360/4095 = **-104.17582417582418**.
- Thus take 3 is 12 counts ABOVE the recorded minimum, about 1.054945 degrees.
- Model lower bound = -1.7453293 rad, about -100.00000275 degrees.
- Excess beyond that model bound = **4.17582143 degrees** (0.07288183285 rad).
- Changing 4095 to 4096 would change the reading only about 0.02543 degrees;
  XML float rounding changes the model limit about 0.00000275 degrees. Neither
  explains away a 4.18-degree discrepancy, and neither was changed.

`arithmetic.json` records range centres/bounds, raw take-3 values and model ranges
for all five body joints. Local calibrated ranges differ from nominal model
ranges for several joints, further showing these are not the same per-arm data.

## Homing pose versus reported zero

Current calibration source first asks for a middle pose, performs half-turn
homings, then records manually traversed min/max ranges. In `_get_half_turn_homings`
(around line 841), the 12-bit half-turn target is **2047 counts**. The final degree
normalization zero is nevertheless the RECORDED RANGE MIDPOINT, not a hardcoded
2047. Here that midpoint is 2145, so a 2047 reading would report -8.615384615 degrees.

If one arbitrarily re-zeroed take 3 around 2047, its shoulder reading would become
-95.56043956 degrees and fall inside the model limit. **That is not a correction
we can justify**: the model new-calibration convention is range-centred, and the
physical pose used when this existing calibration was created is unknown. Do not
adopt an offset merely because it produces an in-range number or a nicer picture.

The recorded homing_offset=1217 is an EEPROM calibration field, not an extra
software correction to add to the normalized angle. `_normalize` uses the returned
Present_Position and stored range; it does not add homing_offset again. Saved
raw_counts means unnormalized Present_Position returned by LeRobot, not a factory
encoder count with all motor-side homing effects removed. Avoid double compensation.
The existing calibration's old/new creation procedure cannot be recovered from
its JSON alone. Source inspection describes current behavior, not a proven history.

## Model limit provenance (pinned upstream primary sources)

The generated API model obtains shoulder_lift axis/range from the pinned Menagerie
SO101 template via tools/assemblies/build_so101_review.py, which copies joint axis
and range directly and labels them sourced, not hardware-calibrated.
Pinned model: google-deepmind/mujoco_menagerie at
f3b6013629c7b94f8ee93fd977b161fa8350f9bc.

Its README traces to TheRobotStudio/SO-ARM100 so101_new_calib.xml. The two README
refs (608122e9ac330a753735f2e18aee73338e9ac407 and
aec17bbc256d1a7342d53aaa4950595d4c30b40d) resolve to the SAME file Git blob
**ee235d7e313a9cd9ab56a98dd707c61c97f1e44a**. Both specify shoulder_lift range
[-1.7453292519943224, +1.7453292519943366] radians, nominal +/-100 degrees.
The upstream URDF also uses approximately +/-1.74533 radians. Menagerie rounding
and the generated exporter did not invent the +/-100 range.

[Upstream calibration documentation](https://github.com/TheRobotStudio/SO-ARM100/blob/608122e9ac330a753735f2e18aee73338e9ac407/Simulation/SO101/README.md)
describes new calibration as joint-range-centred zero and old calibration as the
horizontally extended reference. The old MJCF shoulder range is nominally
[-190,+10] degrees, also 200 degrees wide. Old/new source link frames differ, so
range-centre differences alone do NOT provide a verified universal offset/sign
conversion. The gripper normalized mapping is explicitly not reflected in those
model files; its 0–100 observation still must not be read as degrees/radians.

[New MJCF source](https://github.com/TheRobotStudio/SO-ARM100/blob/608122e9ac330a753735f2e18aee73338e9ac407/Simulation/SO101/so101_new_calib.xml),
[old MJCF source](https://github.com/TheRobotStudio/SO-ARM100/blob/608122e9ac330a753735f2e18aee73338e9ac407/Simulation/SO101/so101_old_calib.xml),
[URDF source](https://github.com/TheRobotStudio/SO-ARM100/blob/608122e9ac330a753735f2e18aee73338e9ac407/Simulation/SO101/so101_new_calib.urdf).

These are CAD/model-description inputs generated through onshape-to-robot. The
inspected files do NOT document per-instance measurements of hackathon_follower's
stops, link revision or assembly offsets. The pinned Menagerie changelog records
wrist-roll range/camera updates, not a measured shoulder range for this arm.
Possible causes include different captured endpoint extents, midpoint/assembly
variation, conservative nominal limits or zero alignment; none is established as
the sole cause. `sources.json` preserves commit-pinned URLs and Git blob IDs.

## New physical attempt and conclusions

Take 4 completed 599 read-only observations, 06:32:49–06:34:49 Pacific. The operator
then said no joint changes were intentional and explicitly said timing or unchanged
pose/jaw opening was uncertain. Two attachments were byte-identical copies of one
oblique photo. The gap was reported as about 1/8 inch without reliable same-opening
association or a ruler photo. Therefore take 4 is preserved UNPAIRED, not counted
as a new distinct pose and not used to fit signs, offsets or gripper conversion.
See ../reference-20261024-take4/README.md and pairing.json. No further capture began.

Take-4 differences from take 3 are approximately pan -3.9560 degrees, lift -0.0879,
elbow +0.0879, wrist flex +3.4286, roll -0.2637 and gripper -0.06821 normalized
points. Numerical differences are not evidence of known isolated joint motion.
All signals were constant within each capture at reported encoder resolution.

Joint signs and offsets remain unverified. Neither an affine offset nor a degree
rescaling was fitted. A sign reversal alone cannot bring magnitude 104.18 inside
a symmetric +/-100 model range. New reliably associated poses, chosen by the human
operator using established controls, must show identifiable geometric references
and changes in individual joints to disambiguate directions and zeros. Wrist roll
needs an asymmetric marker. Gripper needs measured openings paired with simultaneous
unchanged observations at more than one setting; later unpaired 3.18 mm remains
separate from take 3. Do not send diagnostic simulated poses to hardware.

Johaan owns mapping the highlighted face to CAD coordinates before deriving base
height from the coarse 75.4 mm report. The temporary measuring aid is excluded.
Mounting changes cannot fix this joint-coordinate range discrepancy by themselves.
No new simulation acceptance, dynamic accuracy or hardware mapping pass is claimed.
