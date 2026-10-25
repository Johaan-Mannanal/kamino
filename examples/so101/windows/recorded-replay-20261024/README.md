# Episode-0 recorded-command replay handoff

Operator reports **5 successes / 5 attempts**, using the exact charger from the
reconstruction photos. The five successes were not independently observed by
the agent. Consecutiveness is not separately established by a saved trial log.
All five runs reused the original trajectory. No learned policy is involved.

The original dataset is preserved byte-for-byte under dataset/. Episode 0 has
900 frames at a stored 30 FPS, six actions and six original follower observations
per frame, contiguous indices 0–899 and increasing timestamps spanning
29.966667 seconds. A named-channel JSONL export is provided alongside the raw
Parquet, metadata, task and episode files. No camera video was recorded.

**Timing correction:** the supplied command requests --dataset.fps=15, but the
installed replay loop uses CycleTimer(dataset.fps), i.e. the dataset's stored
30 FPS. The CLI FPS field is not used to construct that timer. Effective runtime
cadence was not measured in this audit. The prior estimate of a 60-second replay
must not be treated as verified. Keep requested and effective cadence distinct.

The exact command is in commands/replay-used.txt. runtime.json identifies the
installed interpreter, packages and clean LeRobot source revision. source/
contains relevant source snapshots and their license. These document current
installed behavior; no separate runtime/config log for the past runs was supplied.

Original observations are saved; **actual replay-run follower observations are
not saved**. Standard replay reads live observations but does not persist them.
See references/mapping-and-action-semantics.md for the distinction between
recorded requested actions, potentially capped targets and motor acknowledgments.

Calibration reference and previous model-mapping analysis remain labeled as
references, not verified physical calibration. Starting object orientation,
gripping location, dimensions/mass, marked A/B geometry and a physical demo video
remain unspecified. No trajectory, calibration or installed source was modified.

The one-replay software-restart check is pending operator execution. Follow
operator-restart-check.md; record exact restarted components, starting arm/object
state, outcome, video and cadence summary. No hardware was connected or commanded
by the agent while making this package. No credentials, environment files, shell
history dump or credential-store files are included.

integrity.json hashes every package file except itself. The adjacent ZIP and
its SHA-256 sidecar allow portable transfer. The credential-free package is published on branch `codex/windows-simulation-setup`.
The original dataset and installed robot source were not modified.

Portable archive: [recorded-replay-20261024.zip](../recorded-replay-20261024.zip).
See [update for Johaan](JOHAAN-UPDATE.md).
