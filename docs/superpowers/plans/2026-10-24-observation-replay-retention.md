# Observation replay and revision-bound mapping retention

User approved steps 1 and 2: connect reviewed mappings to recorded observation
replay; retain mapping evidence with assembly jobs and simulator exports.

Design: extend capture packs with optional finite, strictly ordered elapsed-time
samples while accepting older summary-only packs. Play/pause/reset/scrub uses the
latest recorded sample, without interpolation or motor commands. Unverified and
unmapped conversions remain visible; raw limit conflicts are never clipped.
The browser review and exported MuJoCo playback are kinematic, not dynamics tests.

Authenticated mapping saves use assembly revision and mapping-version preconditions.
Each save retains an immutable file; project edits clear the current mapping pointer.
Each processing attempt snapshots its mapping and includes it and the reviewed
project in the portable bundle. Updating mappings cannot rewrite prior exports.

Implementation: isolated backend and replay-panel workers; root owns capture
packaging, API/workbench wiring, portable replay, integration and evidence.
Tests precede behavior changes. Verify with synthetic motion, actual browser
save/reload/replay and extracted bundle headless replay, then full suites/build.
No physical SO101 calibration claim, cloud deployment or new reconstruction job.

## Acceptance completed

Implemented timestamped playback and versioned job/ZIP evidence. Full Python
suite: 330 passed, 2 skipped (upstream Starlette/httpx warning). Frontend: 73
passed. Production build passed with existing large-bundle warning. Live browser
save/reopen/revise/process/download passed; relocated standalone replay consumed
41 synthetic frames. Final CAS fix has focused backend and frontend coverage.
See `examples/assemblies/observation-replay/README.md`. Hardware mapping and
Windows native acceptance remain separate.
