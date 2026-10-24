# Physical comparison evidence preparation

Scope: advance PROJECT phase 6 while Atul owns assembly job/frontend wiring and
Yash owns Windows/hardware evidence. Reuse existing JSON capture format; no new
hardware connection, automatic mapping, rendering an assumed pose or API changes.

- [x] Inspect latest Windows capture at exact commit efa71da.
- [x] Preserve the four source files byte-for-byte without merging unrelated work.
- [x] Test first: valid native units remain explicit and mapping unset; reject
  hash/calibration mismatch, count/error, missing/nonfinite signals and clock errors.
- [x] Add offline capture audit and editable mapping worksheet with null fields.
- [x] Audit real take 2; record limitations and revised Windows instructions.
- [x] Independent review completed; prepare publication and next evidence requirements.

Ruling: implement only evidence readiness now. Sign/zero fitting and model pose
comparison depend on associated photographs and multiple distinct physical poses;
no such evidence is currently present. Do not turn encoder stability into proof
of physical pose pairing or automatically treat normalized gripper values as angles.

Verification: 13 new tests (initial 12 RED then GREEN; declared-unit regression
RED then GREEN), 21 tests including existing SO101 inspection passed. Lint and
format checks passed. Reviewer identified and confirmed resolution of a units
claim: generic reports now explicitly preserve unverified declarations. All four
imported source files match the reported Windows commit byte-for-byte.
