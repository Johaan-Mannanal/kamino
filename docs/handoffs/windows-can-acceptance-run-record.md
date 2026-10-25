# Windows can acceptance run record

Checklist: [Windows acceptance checklist](windows-can-acceptance-checklist.md).

**Status: NOT RUN.** This is a blank reusable execution record. Existing can evidence and earlier tests are not results for Johaan/Atul's upcoming integrated commit.

Copy this template into a new run evidence directory when the handoff arrives. Keep the filled record tied to one exact commit; do not overwrite it after code changes.

## Handoff and runtime identity

| Field | Record |
| --- | --- |
| Tester and run start/end (include timezone) | Pending |
| Johaan selection/backend handoff ref and full SHA | Pending |
| Atul UI handoff ref and full SHA | Pending |
| Exact integrated 40-character SHA | Pending; archive-only commit `44e3aec` is not the integrated feature commit |
| Application checkout path and `git status --short` | Pending |
| Backend process, working directory, command and local URL | Pending; omit secrets |
| Frontend process, source/build identity and local URL | Pending |
| Windows / Python / Node / package manager / MuJoCo versions | Pending |
| Browser name/version and viewport | Pending |
| Isolated acceptance data directory and test job IDs | Pending |
| Cached raw-input mesh path and SHA-256 | Pending; must identify F2, not F4 |
| Fixture import/replay instructions supplied by handoff | Pending |
| Gemini positive/null/error fixture source and adapter | Pending; no external calls |
| Failure fixtures and actual backend vs UI-mock coverage | Pending |
| Provider isolation/intercept configuration and captured request count | Pending; required count is zero |
| Evidence directory | Pending; keep outside application source changes |

## Fixture and state ledger

| Item | Identity / location / hash / notes |
| --- | --- |
| Investigation archive | `can-investigation-f84d7763-20261025T030318Z.zip` |
| Expected archive SHA-256 | `e828bb548dae9e5828a29689f2e91c96f4069ee4c6aa8b5788a5700d2d01db6d` |
| Actual archive SHA-256 and verifier output | Pending |
| Original photos and EXIF orientation observations | Pending; unchanged F1 copies |
| Original raw GLB | Expected SHA-256 `5b9ced8ce875c19b18abd171ce328959a443e6eb3103a21202f94280081bf6ec` |
| Original bad attempt / hashes | Historical `eeb467cd-0965-4899-86e6-80d3388133b1`; preserve separately |
| Historical manual derivative used only for comparison | F4; do not use it as the selection input |
| Selected surface set and saved geometry revision/fingerprint | Pending |
| Saved orientation and selected/oriented source full extents `D` | Pending |
| One reviewed sizing reference: axis/span, value `L`, units, provenance and geometry revision | Pending; historical estimates are not measured ground truth |
| Saved uniform scale factor `s` | Pending; for reference axis `r`, record `s = L / D[r]` |
| Final derived full extents `s * D`, exported extents and numerical tolerance | Pending; do not independently force 57/57/131 mm |
| Proportion/reference mismatches and review outcome | Pending; compare historical estimates/photos without silently stretching |
| Final saved mass/friction and estimate provenance | Pending; distinguish reviewed reference and derived dimensions from temporary Gemini/draft suggestions |
| Successful export A: inputs, attempt ID, artifact path, ZIP hash | Pending |
| Corrected export B: inputs, attempt ID, artifact path, ZIP hash | Pending |
| Intentional failure attempts: IDs, errors and retained artifacts | Pending |
| Relocated B extraction and exact viewer scene path | Pending |
| Original archive/raw GLB verification after run | Pending |

For each state-changing check, attach the saved/API record as well as the UI evidence. Log reference input units, the selected geometry revision, the single scale factor and derived dimensions in backend units. Compare source and final proportions. Record any mismatch against historical 57 × 57 × 131 mm estimates; those estimates and the manual nonuniform derivative are not ground truth or independent axis targets. Capture which exact Apply/Save/Regenerate controls were used and what their labels promised.

## Results

Allowed results: PASS, FAIL, BLOCKED, NOT RUN. Every result needs evidence and an observation. Do not infer a pass from a previous session.

| Check | Result | Evidence filenames/links | Actual observation or blocker; owner |
| --- | --- | --- | --- |
| G01 | NOT RUN | Pending | Pending |
| G02 | NOT RUN | Pending | Pending |
| S01 | NOT RUN | Pending | Pending |
| S02 | NOT RUN | Pending | Pending |
| S03 | NOT RUN | Pending | Pending |
| S04 | NOT RUN | Pending | Pending |
| O01 | NOT RUN | Pending | Pending |
| O02 | NOT RUN | Pending | Pending |
| O03 | NOT RUN | Pending | Pending |
| O04 | NOT RUN | Pending | Pending |
| P01 | NOT RUN | Pending | Pending |
| P02 | NOT RUN | Pending | Pending |
| P03 | NOT RUN | Pending | Pending |
| P04 | NOT RUN | Pending | Pending |
| P05 | NOT RUN | Pending | Pending |
| D01 | NOT RUN | Pending | Pending |
| D02 | NOT RUN | Pending | Pending |
| D03 | NOT RUN | Pending | Pending |
| D04 | NOT RUN | Pending | Pending |
| R01 | NOT RUN | Pending | Pending |
| R02 | NOT RUN | Pending | Pending |
| R03 | NOT RUN | Pending | Pending |
| R04 | NOT RUN | Pending | Pending |
| R05 | NOT RUN | Pending | Pending |
| Z01 | NOT RUN | Pending | Pending |
| Z02 | NOT RUN | Pending | Pending |
| Z03 | NOT RUN | Pending | Pending |
| Z04 | NOT RUN | Pending | Pending |

## Coverage and decision

- Overall result: NOT RUN.
- Required checks passed / failed / blocked / not run: 0 / 0 / 0 / 28.
- Provider requests made: not executed; acceptance run requires zero.
- New captures or reconstructions: none authorized.
- Application modifications made during acceptance: none authorized.
- Geometry selection/orientation acceptance: pending.
- Single-reference review, uniform-scale and derived-dimension acceptance: pending.
- Proportion mismatches reported without stretching; reference provenance retained: pending.
- Numerical physics validation result and its actual scope: pending.
- Actual relocated viewer inspection: pending; record separately from any generated report flag.
- Earlier-download preservation: pending.
- Automatic test/build results at this integrated SHA: pending; supplementary evidence only.
- Failed/blocked checks and responsible owner: pending. Selection/backend behavior goes to Johaan; UI/application state goes to Atul; shared issues require their integrated handoff.
- Next action: await exact integrated commit and replay instructions. After the one acceptance pass, return this record and evidence; do not implement repairs or silently rerun a changing commit.
