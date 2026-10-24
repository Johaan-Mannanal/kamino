# Reusable capture mapping review

Authorized scope: reusable joint signs/offsets/units and explicit gripper conversion;
preview one candidate across multiple stationary captures and flag joint limits.

Implementation choices: extend the existing TypeScript assembly workbench and
Python offline capture audit. A local capture-pack JSON contains audited medians,
source hashes, pairing notes and optional resized photo previews. No hardware API.
Mapping reviews are downloadable/reloadable JSON, bound to the exact project and
capture data. They remain separate from assembly acknowledgements and exports.

1. Test capture packaging and mapping conversions, missing/normalized signals,
   unit/calibration conflicts, limit checks and evidence review invalidation.
2. Add offline capture pack CLI and reusable mapping logic.
3. Add guided controls, capture selector/photos and per-capture findings to the
   workbench. Preview unclipped candidate angles; explicitly display unmapped
   joints at zero. Reset clears capture preview. Model edits invalidate mapping
   review; changing a conversion invalidates that joint's user verification.
4. Generate take-3/take-5 pack, exercise real browser preview/save/reload and
   full automated suites/build. Preserve all unknown physical quantities.

Verification means a named user's evidence-backed attestation, never automatic
calibration or physics certification. Require at least two cited captures and no
mapping conflicts across loaded captures before allowing that attestation.
No automatic fitting, motor commands, torque changes, recalibration, deployment,
or new reconstruction jobs.

## Verification

- Full Python suite: 320 passed, 2 skipped (Python 3.13.7, MuJoCo 3.3.7).
- Frontend: 68 tests passed; production TypeScript/Vite build passed. Existing
  large viewer-chunk warning remains.
- Ruff check and formatting passed. Independent review found a preview-evidence
  binding gap; a failing regression reproduced it, full capture/preview binding
  fixed it, and follow-up review found no further issues.
- Real browser loaded the accepted SO101 package and take-3/take-5 pack, switched
  both poses, edited/restored an offset, downloaded and reloaded the mapping
  review. No browser warnings/errors. Evidence is under
  `examples/so101/comparisons/mapping-review/`.
- All SO101 mappings remain unverified. Take-3 shoulder limit conflict and unknown
  normalized gripper conversion remain visible. No hardware was accessed.
