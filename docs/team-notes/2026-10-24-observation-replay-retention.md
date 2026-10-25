# Observation replay and retained mapping evidence

Branch: `codex/backend-pipeline`. No hardware, calibration or provider calls.

Implemented generic timestamped capture playback in the assembly workbench,
immutable mapping saves bound to assembly revisions, exact mapping snapshots in
attempt ZIPs, and a standalone MuJoCo observation replay script. Processing and
saving both reject stale mapping versions. Original attempt ZIPs stay unchanged.

## Windows follow-up (after current hardware work)

Fetch and merge `origin/codex/backend-pipeline` into the clean Windows simulation
branch while preserving local work. Extract
`examples/assemblies/observation-replay/browser-export.zip` into a fresh folder.
Using the simulation environment, run from the extracted folder:

```powershell
python replay_observations.py --capture synthetic-hinge-motion --report windows-replay.json
python replay_observations.py --capture synthetic-hinge-motion --view
```

Expect 41 frames over four seconds, zero limit conflicts, unverified mapping and
`physical_accuracy_verified: false`. Space pauses; R resets. Capture the native
viewer result and versions; report any divergence. This is prescribed synthetic
motion, not an accuracy test. Headless playback already passed on the Mac after
relocation; Windows/native acceptance of this new runner remains pending.

The SO101 pack at
`examples/so101/comparisons/mapping-review/captures-with-observations.json`
contains all take-3/take-5 timestamps. These were stationary captures and cannot
substitute for a motion recording. Keep signs/offsets/gripper conversion
unverified until their independent evidence is available. No new robot motion or
recalibration is required by this software verification request.
