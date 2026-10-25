# Windows physical-demo handoff

Branch: `codex/windows-simulation-setup`.

Yash reports **5 successful recorded-command replays out of 5 attempts**, using
the **exact charger from the reconstruction photos**. All reuse episode 0 of
`trajectory-20261024-224752`. A consecutive sequence is not separately supported
by a trial log. This is recorded joint-command replay, not a learned policy.

File inspection verifies 900 frames, dataset metadata 30 FPS, six action and
six original follower-observation channels, increasing timestamps spanning
29.966667 seconds and finite values. No camera video was recorded. Actual
replay-run follower observations were not saved; Yash confirms this.

**Timing correction:** the exact supplied command requests --dataset.fps=15,
but the clean installed LeRobot source at
`146d8474932c8b566717eb2738ba459337ab71c4` creates its replay timer from
`dataset.fps`, which is stored as 30. The CLI FPS option is not used by that
loop. Effective physical cadence was not logged. Do not present 15 FPS or a
60-second duration as verified replay behavior.

The package includes original Parquet/metadata, named actions/observations/
timestamps JSONL, exact command/settings, runtime versions, relevant source
snapshots/license, current calibration reference, mapping references, report,
and SHA-256 manifest. The action channel is not a per-motor acknowledged target
log: recording discards send_action's possibly capped return, and replay does
not persist observations or capped target returns. Calibration reference matches
the prior inspected hash; it is not a recording-time EEPROM snapshot.

Next operator-run check remains pending: explicitly restart the replay software,
restore the original starting arm pose and charger placement at A, perform one
replay and capture phone video plus console cadence summary. Report exact
restarted components and the full transfer outcome. No new calibration, learned
policy, matching-simulation work or agent-executed motion is part of this handoff.

No credentials or environment files are included. All physical success claims
remain operator-reported; no agent hardware access occurred during packaging.
