# Public release and evidence index

Published application baseline: October 25, 2026. Public `main` now advances from
the old scaffold to the released application plus current documentation. The
publication preserves commit history; it does not redeploy the running services.

## Source and hosted identity

| Component | Released source | Railway deployment |
| --- | --- | --- |
| Frontend | `275ded890cd9980c01f457680e34f13a86355103` | `886405a4-b1c9-43f6-ac82-c514e0ea0211` |
| Backend | `8d2173fcd4a1d3680fdabb3bfd4b91feedeb0c0f` | `d9827a9e-252d-4ec6-bb49-5333caab9841` |

[Frontend commit](https://github.com/Johaan-Mannanal/kamino/commit/275ded890cd9980c01f457680e34f13a86355103)
includes the compatible backend source. Subsequent publication-only edits change
documentation/configuration examples and CI coverage, not the application code.
The public site is [kamino.design](https://kamino.design).

## Checks and their scope

| Evidence | Result | Scope |
| --- | --- | --- |
| Backend suite at `8d2173f` | 440 passed, 2 optional skips; Ruff passed | Application and simulation regressions, not measured physical fidelity |
| Frontend at `275ded8` | 118 shared/legacy + 149 Workspace tests; both typechecks/builds passed | UI logic and builds |
| Browser layouts | 320, 390, 430, 760, 761, 844, 1024 and 1440 px checks | Chromium/WebGL and touch emulation; no blanket real-phone certification |
| Local copied can fixture | Whole-source generation, reopen and old ZIP preservation passed | All 121,014 source faces retained; geometry correctness is a separate question |
| Staging | Existing synthetic job save/generate/reopen and preserved downloads passed | Actual hosted backend; suggestion responses replayed locally |
| Relocated export | Three-second MuJoCo run, finite state, zero warnings | Portable loading and bounded numerical behavior |
| Production follow-up | Existing job/auth/download, viewer controls, estimated friction and landscape checks passed | Read-only job checks apart from session authentication and a non-saving sizing preview; no new provider calls |

The current source retains earlier Windows acceptance reports as historical,
commit-specific evidence. They are not a rerun of every Windows scenario on the
new whole-mesh/mobile release. The latest checks did not submit new paid
reconstruction or estimate requests.

Public implementation notes:

- [Viewer restoration and aspect-aware camera fit](handoffs/workspace-viewer-camera-fit-20261025.md)
- [Mobile follow-up and tested viewports](handoffs/mobile-after-core-release-20261025.md)
- [Optional crop and automatic estimated friction](handoffs/upload-simplification-and-friction-20261025.md)
- [Current application scope](PROJECT.md)
- [Figma evidence status](FIGMA_EVIDENCE.md)

Detailed hosted receipts, test logs and screenshots are retained in the team's
`outputs/combined-workspace-release-20261025` and `outputs/mobile-after-core-20261025`
evidence directories. They are not all public artifacts; this index does not
pretend that workstation paths are downloadable links. Private production backups,
credentials and user job storage are not published.

## Compatibility and rollback

The whole-mesh release adds saved geometry scope/source identity. Keep the
compatible backend when rolling the frontend back: an older strict-contract
backend cannot safely read every new saved record. Production rollback images
and a restored, integrity-checked data backup were preserved. Publication to
GitHub does not stop or modify the current site, its storage or those backups.

The illustrative arm presentation is separate. It preserves recorded arm poses
but scripts charger transfer. Joint mappings, physical alignment and grasp/contact
accuracy are not accepted by these software checks.

## Publication verification

The publication reran all 149 Workspace tests, TypeScript checking and the
production build successfully. Existing dependency symlinks required invoking the
installed tools directly after pnpm refused to replace a symlinked modules directory;
no other checkout's dependencies were removed. This was not a fresh dependency
installation. Local Markdown targets and whitespace checks passed, and a scoped
tracked-file credential-pattern scan found no matches. No application source changed.
CI now checks the current Workspace in addition to the shared frontend/backend.
GitHub CI results for the publication are separate from these local results.
