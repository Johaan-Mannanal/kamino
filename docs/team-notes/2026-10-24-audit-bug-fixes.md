# Audit bug fixes

Author: Codex, for Srijan. Date: 2026-10-24.

Branch: `codex/fix-reconstruction-retries-and-scene-validation`.
Implementation commit: `c4d8130e61cfa086ac124ab20b777292c8a6c5fc`.
Push status: implementation pushed to origin. PR targets `codex/asset-preparation`,
which contains the reviewed pipeline and has not yet landed on main.

## Confirmed changes

- `src/photo2sim/api/worker.py`: three attempts for explicitly transient polling
  and download failures, with stop-aware one- and two-second backoff. Submission
  stays outside the retry wrapper. Shutdown retains the saved task for recovery.
- `src/photo2sim/integrations/reconstruction.py` and `meshy.py`: explicit retryable
  error classification for safe reads; terminal HTTP, invalid data and filesystem
  errors fail immediately.
- `src/photo2sim/simulation/validate.py`: reject displaced or detached geometry,
  check collision/body/ground alignment, and report reconstructed mesh center
  offsets while accounting for MuJoCo's internal mesh frame transforms.
- `tests/test_worker.py`, `tests/test_simulation_export.py`: 27 new regression cases.
- `docs/API.md`: document bounded provider retries and submission behavior.

## Verification

Windows Python 3.12.10; MuJoCo 3.17.0; NumPy 2.5.4; trimesh 5.2.0 in `.venv-sim`.

Commands from the repository root:

```powershell
& ./.venv-sim/Scripts/python.exe -m pytest -q --junitxml=outputs/audit/fixes-tests.xml
$auditPythonFiles = @(git ls-files '*.py')
& ./.venv-sim/Scripts/python.exe -m ruff check @auditPythonFiles
& ./.venv-sim/Scripts/python.exe -m ruff format --check @auditPythonFiles
git diff --check
```

Full suite: 183 passed, 2 skipped; one existing Starlette/httpx deprecation warning.
Lint, formatting and whitespace checks passed for the PR files. Tests required
execution outside the sandbox's restricted temporary directories.

Headless revalidation called `validate_export` with its default 3-second duration
and portability enabled on each `examples/simulation/asset-export/bundles/*/scene.xml`
and on the charger ZIP extracted at `outputs/audit/charger/scene.xml`. All four
passed original and relocated runs. Local evidence is
`outputs/audit/fixes-simulation.json` and is intentionally untracked.

The prior audit ran native cuboid/charger viewer loops and inspected saved charger
renders. No new native viewer inspection is claimed for this code change. Provider
regressions use mocked HTTP; no paid reconstruction was submitted.

## Remaining limits and next action

Longer provider outages can still exhaust the three-attempt budget and fail the
job; this change does not add a manual resume endpoint. Charger's known axis and
proportion issues require source-photo and physical-dimension reconciliation.
Those issues are separate from numerical validation and remain unchanged.

Review and merge the fix PR into the asset-preparation branch, then include it
when that feature branch is integrated. An unrelated concurrent pickup demo was
excluded from the PR.
