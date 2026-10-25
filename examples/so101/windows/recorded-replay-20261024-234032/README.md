# New recorded-command replay candidate: trajectory-20261024-234032

The operator supplied a replay command pointing at `$trajectoryRoot` and says a
new recording is in use. The operator explicitly confirms that `$trajectoryRoot` points to
**`trajectory-20261024-234032`**, the active recording preserved in this package. Other recent completed datasets are
23:38:38 and 23:39:25; 23:36:50 and 23:40:16 contain zero completed episodes.
Do not silently substitute one of them or the older recording.

Episode 0 has **900 frames at stored 30 FPS**, six action and six original
follower-observation channels, contiguous indices 0â€“899, increasing timestamps
spanning 29.966667 seconds, and finite values. Raw files are byte-preserved under
`dataset/`; a named-channel JSONL export is alongside them. No camera video is
included. Raw data SHA-256:
`3e90db28cc3abc41ae96924ec3bf9c924f47b5910678edbf8dc94bba622c5136`.

[Exact supplied command](commands/replay-as-supplied.txt) retains the variable
rather than inventing its value. Before operator execution, verify the variable
points to the intended dataset. No command was executed by the agent.

The command requests --dataset.fps=15, but the inspected installed replay loop
uses the loaded dataset.fps=30 for its timer. Actual achieved replay cadence is
unknown. This package does not change the dataset FPS, timing code, calibration,
servo configuration or safety cap. The supplied max_relative_target is 5.0;
targets can be capped relative to current observations, so dataset actions are
not a motor-acknowledgment or replay-tracking log.

**The earlier 5/5 success result belongs only to trajectory-20261024-224752.**
No replay success count, separate replay observations, software-restart outcome,
video, starting object placement, or object identity has been supplied for this
new recording. These remain unknown, rather than inheriting old results.

Installed LeRobot 0.6.2 source remains clean at
`146d8474932c8b566717eb2738ba459337ab71c4`. Source snapshots were compared to the
installed files. The current cached calibration SHA-256 remains
`17db9518c585eec7fd5a28a436699c9824355e22816ccb9488d1ee6dc9682237`.
It is a reference, not a recording-time EEPROM snapshot. All simulation mappings
remain unverified; the earlier shoulder-limit conflict is preserved.

See [report](replay-report.json), [runtime identity](runtime.json),
[mapping/action references](references/mapping-and-action-semantics.md) and
[update for Johaan](JOHAAN-UPDATE.md). This is recorded command replay, not a
learned policy. No new hardware action or simulation matching is performed.
Credential/environment files are excluded. `integrity.json` hashes all other
package files. [Portable ZIP](../recorded-replay-20261024-234032.zip).
