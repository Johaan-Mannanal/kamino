# Exported assembly simulation replay

Goal: independently advance PROJECT phase 7 (repeatable demo and cached backup)
while Atul owns assembly HTTP/UI integration and Yash collects paired physical
reference evidence. Uses existing reviewed exports and validation. No hardware,
physical calibration, new photo reconstruction or change to assembly contracts.

Design: a local CLI/library accepts a scene plus a JSON list of durations and
complete named radian targets. Validate inputs and existing scene before running;
reset simulated state; drive actuators with mj_step; record actual joint positions
and endpoint errors; optionally render an offscreen GIF. Preserve failed motion
reports. All sequence output paths must be new. Keep units and assumptions visible.

- [x] Tests first: actual dynamics (not pose teleportation), deterministic fresh
  runs, invalid/missing/out-of-range targets and duration bounds, retained failure.
- [x] Implement generic runner and offscreen recorder outside Atul-owned modules.
- [x] Exercise generated SO101 and visually inspect replay.
- [x] Review and validate; package evidence/reproduction instructions for publication.

Ruling: this is scripted action prediction inside the assumed simulator, not
replay of Yash's physical observations. No mapping is assumed from the unpaired
stationary capture. GIF timing is approximate; timestamped JSON is authoritative.

Results: 40 recorder/export tests passed; 10 recorder tests repeated after final
camera framing. Eight-second generated SO101 sequence passes with max endpoint
error 0.000500117 rad, zero warnings. First sandbox renderer failed and retained
report; graphics-enabled retry succeeded. Contact sheet inspected. Independent
review found no material issue; optional dangling-symlink preservation tightened
with a failing-then-passing regression. Source simulation and trace are unchanged
by camera reframing. No hardware, provider jobs or API/frontend edits.
