# SO101 stationary reference take 3 — operator-associated photographs

Take ID: `reference-20261024-take3`. This is the first capture coordinated with
Yash ready to take front/side photographs. Takes 1 and 2 remain unchanged and
unpaired. No motion command, recalibration, torque change or servo-setting write
was used for this capture. LeRobot operator controls stayed closed per procedure.

## Association and timing

Before capture Yash said 'ready for paired capture'. After the capture-active
instruction, Yash confirmed 'Both photos taken; arm stayed unchanged'. The two
original PNG attachments supplied afterward are preserved in photos/.
They support **operator-confirmed stationary association**, not hardware camera
synchronization. `pairing.json` records that method, confirmation, relative image
paths, dimensions and SHA-256 hashes. Exact photo capture times are UNKNOWN: these
PNG attachments have no EXIF capture timestamps. File creation/upload timestamps
were not substituted for exposure timestamps. No photos were cropped, enhanced,
resized, mirrored or recompressed. Original resolution is retained.

Read window: 2026-10-24 05:20:46.134340–05:22:45.984484 America/Los_Angeles
(12:20:46.134340–12:22:45.984484 UTC). 599 complete samples over 119.843621 s,
measured successful sample rate 4.989836 Hz. Each row has UTC read start/end,
elapsed monotonic time, raw encoder counts and normalized observations from those
same counts. These serial reads do not have hardware-synchronized sensor times.

The constant reported pose was:

| Signal | Value | Unit |
|---|---:|---|
| shoulder_pan.pos | -0.39560440 | degrees |
| shoulder_lift.pos | -104.17582418 | degrees |
| elbow_flex.pos | 96.17582418 | degrees |
| wrist_flex.pos | 84.04395604 | degrees |
| wrist_roll.pos | 4.17582418 | degrees |
| gripper.pos | 0.95497954 | calibrated normalized 0–100 |

Identity: LeRobot 0.6.2 at 146d8474932c8b566717eb2738ba459337ab71c4, Python
3.12.10; follower hackathon_follower, COM5, six STS3215 motors IDs 1–6 in table
order. The read-only helper explicitly normalizes first five joints as degrees,
gripper as 0–100. Calibration readback matched the existing JSON, preserved here
with SHA-256 `17db9518c585eec7fd5a28a436699c9824355e22816ccb9488d1ee6dc9682237`.
No running teleop process/action config is claimed. Requested/sent actions are
unavailable because no actions were sent.

## Image inspection

- `photos/front-oblique.png` (2160 x 2880): folded follower, white printed structure,
  black servos, base and gripper pointing down toward the tabletop; camera/PCB/lens
  assembly projects to the right. Lower structure occludes some links from this
  view. It is an oblique front view, not a calibrated orthographic projection.
- `photos/side-oblique.png` (3840 x 2160): overlapping folded links, gripper and
  tabletop, wiring, electronics and a black clamp with orange contact parts
  securing the base at the table edge. The gripping faces appear separated; no
  ruler or physical jaw-gap measurement is present.

Together the images are useful qualitative single-pose evidence. Camera intrinsic
parameters, mirror/orientation provenance and exact view angles were not calibrated.
The images do not establish metric dimensions or prove every CAD component/revision
matches hardware. Camera mounting and cable routing are visible, but their metric
geometry/extrinsics are unmeasured. Modifications relative to the CAD are still
unconfirmed by the operator. No inferred image scale or dimensions are promoted
to measurements.

## Files and validation

`capture.json`, `calibration.json` and `observations.jsonl` are preserved from the
completed read-only session. Original helper capture.json has the capture-time
placeholder 'unpaired; operator stationary association required'; the later
pairing.json supersedes that association status without editing capture metadata.
`summary.json` supplies ranges/rate and points to the pairing record.
`offline-audit.json` passes calibration/hash, sample completeness, finite values and
timestamp ordering. Its physical/mapping flags remain false because the generic
auditor does not verify operator photo associations; it was not edited to claim
physical accuracy. Separate pairing-integrity.json checks received file hashes
and references only, not optical synchronization or physical calibration.

Audit command (choose a fresh output on repeat):

```powershell
& .\.venv-sim\Scripts\python.exe -m photo2sim.simulation.pose_review examples/so101/windows/reference-20261024-take3 --report outputs/so101-take3-new-audit.json
```

Actual capture command (already completed; do not rerun unattended):

```powershell
& "$env:USERPROFILE\lerobot-env\Scripts\python.exe" tools/so101/capture_stationary.py --port COM5 --calibration "$env:USERPROFILE\.cache\huggingface\lerobot\calibration\robots\so_follower\hackathon_follower.json" --source "$env:USERPROFILE\lerobot" --output-dir outputs/so101/reference-capture-20261024-paired-take3 --seconds 120
```

## Remaining mapping/measurement work

One associated pose cannot determine all joint signs/zeros or validate servo
dynamics. Shoulder_lift's declared degree value is outside the imported model
limit; do not silently clip/replay it. Gripper 0.95498 is normalized, not degrees,
radians, mm or proof of fully closed jaws. Jaw opening, base/table metric placement
and mounting orientation remain UNKNOWN. No 0.15 m simulation test height is
adopted as a physical measurement.

Next: Johaan can inspect this associated pose alongside the CAD/template. If
additional poses are needed, the human operator uses established controls, then
coordinate another stationary observation/photo interval. For metric geometry,
photograph ruler endpoints at the gripping faces and identifiable base/table
references. Table height/thickness alone do not establish a base/world transform.
No further motor action is authorized by this document.
