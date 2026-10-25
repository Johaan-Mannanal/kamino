# Stationary capture mapping review

Use the assembly workbench's **4. Compare stationary captures** section to map
recorded joint signals to the current model. This workflow is generic to the
current revolute-joint assembly format; it contains no SO101 joint rules.
It is an offline kinematic diagnostic, not an automatic calibration or hardware
controller. Prismatic joints and nonlinear gripper conversions are not supported.

## Package captures

Keep each source capture in its own directory with `capture.json`,
`calibration.json` and `observations.jsonl` in the existing stationary-audit
format. Optional `pairing.json` records human association; optional
`integrity.json` hashes supplementary files. The packager checks the capture
metadata, calibration agreement, finite ordered observations, and supplied
integrity/photo hashes. It preserves medians, ranges, declared units, source
hashes and pairing notes. Photo previews are resized JPEGs, with original hashes;
source files are never changed. Pairing is not inferred from stable readings.

```sh
python -m photo2sim.simulation.capture_pack \
  --capture examples/so101/windows/reference-20261024-take3 \
  --capture examples/so101/windows/reference-20261024-take5 \
  --output outputs/captures-new.json
```

Choose a fresh output file. Use the same command with your own capture directories
(up to 20). Imported browser JSON records provenance; the browser does not
independently re-read original capture files or certify their declarations.

## Review a candidate

1. Open the assembly's saved job or its offline review package at `/assembly.html`.
2. Load the capture pack in section 4. Matching joint names are suggested as
   sources with positive sign and zero offset; every row starts **Unverified**.
3. Select a capture to preview its median readings. The same conversion is
   applied to every capture in the findings table. Photo viewpoints are not
   automatically aligned with the model camera.
4. Edit source, unit, sign and offset. The equation is
   `q_rad = sign * radians_per_unit * reading + offset_rad`.
   Degrees and radians use fixed unit conversions. Normalized signals require
   an explicit positive scale; no percentage-to-angle mapping is inferred.
5. Check every capture, including minimum/maximum signal ranges against model
   limits. Unit mismatches, missing signals, duplicate source assignments and
   different calibration hashes remain conflicts. Angles are never clamped.
   Unconverted joints use zero only for display, visibly marked in the report.
6. Reset returns the preview to zero. This does not reset or recalibrate hardware.

## Record evidence and retain the review

**Record user verification** requires a reviewer, an evidence note, at least two
loaded captures with distinct readings for that source, and no conflicts for
that joint across the loaded captures. It cites all loaded captures. This is a
recorded user attestation, not independent proof of calibration. Two changed
readings alone cannot establish a correct sign, offset, or nonlinear jaw curve;
the reviewer must explain the independent evidence. Numerical checks never
promote status automatically.

Conversion edits clear that joint's verification. A changed project revision
clears all verification. Loading another capture pack starts a fresh candidate.
**Save mapping review and report** downloads mappings, comparisons, source
metadata, photo previews and the exact project snapshot. Reload it against the
same project revision. Modified conversions/evidence cannot retain a stale
verification binding. Bindings detect stale content; they are not digital
signatures or authenticated identities.

## Replay timestamped observations

New capture packs include each audited observation as `observations`, with elapsed
`time_s` and named `values`. Older summary-only packs still support stationary
comparison but cannot replay. Select a capture, then play, pause, reset or scrub.
Playback holds the latest recorded sample at its original elapsed time; gaps are
not interpolated. The same signs, offsets and unit conversions apply to all rows.
Limit conflicts are displayed without clipping. Unmapped joints use zero only for
display. This animates measured/recorded configurations; it does not predict motion,
validate forces or send hardware commands. Stationary captures remain stationary.

## Retain with a job and export

For an open backend job, save assembly edits first, then use **Save mapping to
job**. Evidence is bound to that exact saved project revision. Each mapping save
creates an immutable version; stale revision/version saves are rejected. Reopening
the job restores its current mapping. Local JSON download remains available for
offline work. Changed assembly revisions start with no retained mapping, so review
and save the candidate again before processing.

Processing snapshots the retained mapping version. Mapped bundles include
`mapping-review.json`, `reviewed-project.json` and `replay_observations.py`.
Previously generated exports never change after later mapping edits. To export a
new mapping after completion, save the new mapping and process another attempt.
The assembly revision stays the same; the mapping version distinguishes attempts. Failed attempts retain their available evidence.

From an extracted mapped bundle, with its simulator requirements installed:

```sh
python replay_observations.py --capture CAPTURE_ID --report replay-report.json
python replay_observations.py --capture CAPTURE_ID --view
```

On macOS the native viewer requires `mjpython` in place of `python`. Space pauses;
R resets. Headless replay writes recorded angles and conflicts, using `mj_forward`
and no dynamics steps. The runner checks the reviewed project and scene joint
names/limits, but does not authenticate hardware evidence or certify physical
accuracy. It requires the bundled dependencies, not the Kamino package.

Mapping evidence remains separate from assembly acknowledgements. No calibrated
SO101 mapping is supplied; its candidate remains unverified pending independent
physical evidence.
