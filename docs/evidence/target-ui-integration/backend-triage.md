# Backend verification triage after target-review v2 integration

Recorded 2026-10-24 America/Los_Angeles. This ledger separates the previous
pre-target UI baseline from the patched target-review checks. It does not repair
backend code, acquire missing assets, or establish physical/hardware acceptance.

## Previous full-suite result

Source log: `outputs/ui-integration/python-final-tests.log` (also preserved with
the pre-target integration evidence under `outputs/ui-integration/b61383f-baseline`).
Reported result: **353 passed, 8 skipped, 13 failed, 9 errors**, one upstream
Starlette/httpx deprecation warning, 110.23 seconds.

The 22 nonpassing cases classify as **14 unavailable fixture cases** and
**8 filesystem-permission cases**. Two of the permission cases surfaced as
assertions rather than direct tracebacks; their persisted job records identify
the underlying failure. This is evidence-based triage, not a claim that every
case would pass in another environment. No fixture or export was replaced to
force the suite green.

### Missing fixtures: 14 cases

* Nine `tests/test_so101_workspace.py` setup errors all fail while opening
  `examples/simulation/apple-20w-charger-cleaned/api-acceptance/simulation.zip`.
  Tests never reach their own behavioral assertions.
* Four `tests/test_capture_pack.py` failures depend on absent photo files under
  `examples/so101/windows/reference-20261024-take3` and `...take5`. The available
  JSON metadata remains present, but the `photos` directories are absent.
  `test_tampered_photo_rejected` fails opening `take5/photos/front.png` in its
  copied fixture. The real-capture/observation cases reject unavailable declared
  evidence. `test_duplicate_capture_ids_rejected` expects a duplicate-ID error,
  but the first capture fails evidence validation before a duplicate can be
  visited. Its regex assertion is consequently a fixture prerequisite failure.
* `tests/test_so101.py::test_pinned_robot_loads_and_holds_without_numerical_warnings`
  fails because MuJoCo cannot open
  `third_party/robotstudio_so101/moving_jaw_so101_v1.stl`.

### Filesystem permissions: 8 cases

Six logs show direct `PermissionError: [WinError 5]` during staging-directory
rename/publication within the workspace test output directory:

* `test_assembly_export.py::test_validation_rejects_scene_disagreeing_with_reviewed_record[mass]`
* `test_assembly_export.py::test_convex_rejects_shared_transform_preserving_bounds`
* `test_assembly_jobs_api.py::test_two_link_import_revision_process_and_download`
* `test_assembly_motion.py::test_invalid_action_is_not_clipped_or_started[phase1]`
* `test_assembly_review.py::test_revisions_keep_sources_and_previous_output`
* `test_simulation_export.py::test_reusable_validator_rejects_corrupted_exports[no_contact]`

Two additional assembly API assertions are downstream of the same class of
failure, verified in the retained synthetic jobs:

* `test_real_motion_failure_corrected_revision_preserves_history` expects
  `completed`, receives `failed`. The revision-2 job at
  `outputs/pytest-ui-final-all/test_real_motion_failure_corre0/assemblies/f1b64445-a220-44a9-9ccd-9bc14a91baa3/job.json`
  records `preparation_failed`, message `Assembly processing failed: PermissionError`.
* `test_hash_auth_and_failed_validation_retained` expects `export_generated=true`,
  receives false. Its job at
  `outputs/pytest-ui-final-all/test_hash_auth_and_failed_vali0/assemblies/b8b4f2ce-cc5b-42d1-83b2-76906b9a9458/job.json`
  records `export_failed`, message `Assembly processing failed: PermissionError`.

No independent product behavior assertion is established by these two
assertion traces once their saved failure causes are considered. They remain
nonpassing baseline checks, not silently reclassified as passes.

## Patched focused target-review result

Command from repository root, executed with the available elevated test runtime
because restricted Windows TestClient/filesystem execution can interfere:

```powershell
.\.venv-sim\Scripts\python.exe -m pytest tests/test_target_geometry.py tests/test_target_review_api.py -q --tb=short --basetemp=outputs/target-ui-integration/pytest-focused
```

Detailed output: `outputs/target-ui-integration/python-target-focused.log`.
Result: **12 passed**, one upstream Starlette/httpx deprecation warning, 7.18 s.
This verifies the applied target-review backend code in the current uncommitted
integration tree; final source/commit identity must be recorded separately.

The tests use synthetic geometry and a reconstruction guard. They cover explicit
selection, multiple smaller islands, source/orientation binding, empty/unknown
IDs and revision conflicts, unreviewed processing rejection, target-only export,
regeneration/history preservation, exact seams/scene instances, and optional
geometry-runtime failures. They make no real provider or hardware calls.

This focused pass does not replace final UI/source-race acceptance, real can
geometry fidelity review, missing fixture execution, or hosted deployment checks.

## Patched full-suite detailed run

Source log: `outputs/target-ui-integration/full-backend-detailed.log`.
Result: **369 passed, 8 skipped, 9 failed, 9 errors**, one upstream
Starlette/httpx warning, 106.15 s. The 18 nonpassing cases classify as the same
**14 missing-fixture cases** and **4 direct filesystem-permission failures**.

The missing fixtures remain the charger ZIP (nine setup errors), take3/take5
capture photos (four failed tests including the downstream duplicate-regex
assertion), and an SO101 STL (one failed test). In this run MuJoCo reports the
first unavailable robot asset as `wrist_roll_follower_so101_v1.stl`; this differs
from the earlier first missing STL and does not establish a newly introduced
robot behavior regression.

The four direct `PermissionError: [WinError 5]` failures occur during staged
directory rename, before the tested behavioral checks can finish:

* `test_assembly_motion.py::test_invalid_action_is_not_clipped_or_started[phase4]`
* `test_assembly_review.py::test_explicit_exclusion_is_recorded`
* `test_mapping_retention.py::test_revision_clears_mapping_pointer_but_retains_the_old_mapping_file`
* `test_sizing.py::test_uniform_sizing_preserves_all_edge_lengths_and_selected_oriented_extent[orientation1-z-expected1]`

The detailed sizing failure specifically shows `.photo2sim-export-.../bundle`
publication to its temporary `export` folder denied by Windows; it is not a
dimension/proportion assertion mismatch. No independent product-behavior failure
is demonstrated in this detailed full-suite log. The suite remains non-green;
these cases have not been silently skipped, assets substituted, or code repaired.
