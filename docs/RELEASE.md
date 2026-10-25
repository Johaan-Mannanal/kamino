# Public release and evidence index

Application release: October 25, 2026. The advanced-physics baseline is
[`410e88ac6c3e39ec5ab7a176593670d5b5fb7416`](https://github.com/Johaan-Mannanal/kamino/commit/410e88ac6c3e39ec5ab7a176593670d5b5fb7416).
Public `main` includes this release; later documentation commits do not redeploy
services. The application is available at [kamino.design](https://kamino.design).

## Source and hosted identity

| Component | Railway deployment |
| --- | --- |
| Frontend (Echo `cb57f0e`) | `94c0e1c3-8827-43bf-8b29-732eeed70a8d` |
| Backend (Echo `cb57f0e`) | `aa441527-519c-44fc-a4c4-0a4cd7ade4c6` |

Production imported-source hashes and runtime matched the staging candidate.
Linux verification used Python 3.12 and MuJoCo 3.17.0; local/relocated verification
also covered MuJoCo 3.3.7. Dependency/runtime identities matter independently of
source identity.

## Echo branding follow-up

The current shared runtime source is
[`cb57f0e`](https://github.com/Johaan-Mannanal/kamino/commit/cb57f0e).
Its 492 backend tests (2 optional skips), 143 shared frontend tests and 163 Workspace
tests passed, along with both builds/typechecks, asset synchronization and Ruff.
Independent review found no actionable issues. Local/staging/production checks
covered responsive logo loading, home links, 200% zoom, icons, social metadata and
saved sizing. Newly generated export guides contain a packaged local SVG; a
production-side temporary synthetic export ran after relocation with finite state
and zero warnings. All 15 existing production ZIP hashes remained unchanged.
No provider calls, schema changes or recorded-motion changes were made.

[Brand guide and reusable assets](brand-guidelines.md). Detailed receipts are in
the team's local `outputs/branding/kamino-echo-final` directory. Figma/Slides and
Devpost artwork publication remain separate team actions.

## Checks and their scope

[CI run 40202374448](https://github.com/Johaan-Mannanal/kamino/actions/runs/40202374448)
passed on this exact application commit.

| Evidence | Result | Scope |
| --- | --- | --- |
| Backend | 492 passed, 2 optional skips; Ruff passed | Software and simulation regressions, not measured physical fidelity |
| Frontend | 143 shared + 160 Workspace tests; both typechecks/builds passed | UI logic and builds |
| Local browser | 202 checks passed | Desktop/mobile presentation, draft and camera behavior, downloads and progress |
| Hosted mobile | 97 checks passed | Chromium touch emulation, portrait/landscape scrolling and reduced motion; not native iPhone certification |
| Hosted rigid workflow | Save/reopen/regenerate, earlier ZIP preservation and browser download passed | Advanced placement, collision, COM/inertia, friction and solver settings |
| Relocated rigid export | 10,000 MuJoCo steps, finite state, zero warnings | Portable loading and bounded numerical behavior |
| Hosted assembly | Seven links, six joints, two revisions/attempts; earlier artifacts preserved; stale save rejected | Hinge/slider springs, negative/zero-ratio followers, force/torque limits and per-link physics |
| Production follow-up | Source/runtime identity, authentication/reopen, controls, old ZIP preservation and synthetic assembly export/relocation passed | Existing photo jobs were not modified; assembly checks used synthetic inputs |
| Reconstruction progress | 1%, stalled progress and download-stage fixture checks passed | Intercepted responses, not a new provider reconstruction |

No new Meshy or Gemini requests were made for this release's acceptance. These
checks do not validate the geometry of an arbitrary generated object. Earlier
Windows acceptance reports remain tied to their original commits; this is not a
rerun of the full Windows checklist on the new advanced-physics release.

## Independent hosted retest and known issues

Johaan's separate October 25 hosted retest passed cached-mesh sizing, save/reopen,
regeneration, preservation of earlier exports, download and local MuJoCo loading.
Upload validation, cropping, demo export and saved assembly reopening also passed.
It identified its browser assets by hash rather than an independently confirmed
Git SHA, so it supplements the record without extending exact-commit acceptance.

The reported stale stretching notice is fixed in frontend commit
[`90e45bd`](https://github.com/Johaan-Mannanal/kamino/commit/90e45bd): the notice now
follows saved sizing, remains during unsaved edits or failed saves, and clears
immediately after a successful uniform save. Regression coverage includes legacy
and explicit independent-axis modes. Staging and production browser checks used intercepted API
responses, with no real job writes or provider calls. Sizing/export logic is unchanged.
This follows the sharing-card/icon update in `2c9d869`; both are frontend-only
changes on the advanced-physics baseline.

One previously recorded display issue remains:

- The assembly canvas can overflow after a desktop-to-phone resize. That resize
  behavior predates this release; the new controls did not resolve it.

The previous synthetic demo “Saved” wording issue did not recur in that retest.

## Implementation and supporting evidence

- [Advanced physics, joint settings and truthful reconstruction progress](advanced-physics.md)
- [Viewer restoration and aspect-aware camera fit](handoffs/workspace-viewer-camera-fit-20261025.md)
- [Mobile follow-up and tested viewports](handoffs/mobile-after-core-release-20261025.md)
- [Optional crop and automatic estimated friction](handoffs/upload-simplification-and-friction-20261025.md)
- [Current application scope](PROJECT.md)
- [Figma evidence status](FIGMA_EVIDENCE.md)

Detailed hosted receipts, test logs and screenshots remain in the team's
`outputs/advanced-physics-release-20261025` evidence directory. The independent
retest is in `outputs/hosted-site-retest-20261025`. These are local evidence
locations, not public download links. Private production backups, credentials and
user job storage are not published. Public CI is independently accessible above.

## Compatibility and rollback

Previous frontend source `275ded8` and backend `8d2173f` remain in Git history.
Production images and an integrity-checked, restored data backup were preserved
before cutover. A frontend rollback can retain the new compatible backend. An
older strict backend cannot safely read every new advanced-physics/progress record;
a full backend rollback requires its matched snapshot and preservation of any
post-cutover jobs before restoration. Documentation publication does not change
services, data or rollback artifacts.

The robotics prototype demonstrates trajectory transfer: initial leader-arm joint
recordings were previewed and adjusted in MuJoCo, exported, and executed on the
SO-101 follower arm, with iteration between simulation and hardware. See
[the robotics demonstration](ROBOTICS_DEMO.md). This account was clarified by the
team on October 25, 2026; it does not extend the software test results above into
physical calibration or contact/grasp accuracy claims. Earlier illustrative
animations and observation-only playback retain their original artifact scope.
