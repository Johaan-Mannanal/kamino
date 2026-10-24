# Guided assembly review and SO101 application

Approved scope: continue the reusable guided conversion workflow, then apply it to
SO101 while Windows gathers hardware evidence. Execute inline with final review.

## Design and implementation choices
- Local review project: immutable source-part paths/hashes, metre geometry, each
  part's common-frame placement, editable rigid groups with common-frame pivots,
  and reviewed fixed/revolute connections. Derive parent/child transforms from
  group frames; transform geometry into link frames without deforming it.
- Every part is assigned once or explicitly excluded with a reason. Group and
  joint review acknowledgements are required before preparation. An engineering
  review does not change measured/sourced/estimated provenance.
- A browser workbench in the existing frontend loads a local review package,
  previews individually colored parts, edits grouping/frames/joint properties,
  moves joint sliders kinematically, and downloads an editable project. No cloud
  service, secrets, hardware control or new reconstruction required.
- Reusable local CLI creates review packages and prepares reviewed records into
  new directories for the existing assembly exporter/validator. HTTP processing
  and persistence integration remain a subsequent slice, clearly labeled.
- SO101: tessellate the eleven already-matched STEP components; preserve nominal
  units. Use explicitly sourced reference-model grouping, local placements,
  frames, axes, limits and masses as a visible template. Omit servos/fasteners/
  camera geometry not mapped in this first CAD subset and record omissions.
  No claim of automatic photo articulation or hardware accuracy.
- Keep ordinary motion validation unchanged. If box collisions or approximate
  dynamics fail, retain failure reports; separately verify FK/template agreement.

## Tasks
- [x] Generic review contract, grouping and transformed mesh preparation; test
  graph/assignment/review gates, hashing/path containment, transform correctness,
  revisions, no-overwrite and provenance.
- [x] Local browser workbench and CLI review packaging; test FK and edits, build,
  and browser acceptance for load/edit/review/save.
- [x] SO101 CAD subset and explicit template project; generate and inspect new
  output, compare FK to pinned reference, retain dynamic validation findings.
- [x] Update project/docs and Windows handoff; full tests and independent review.

## Verification and rulings
Starting point d830577. Existing rigid pipeline and reference model are preserved.


Implemented local workbench, review snapshots/source locks, generic STEP importer,
grouping and CLI. SO101 11-component/7-link/6-joint candidate generated through
these tools. Three-pose template consistency passes. Dynamic tracking fails with
retained reports and initial base/shoulder box penetration (~19 mm); no threshold
changes. Browser load, slider, joint note/edit/acknowledge and download inspected;
actual downloaded JSON accepted structurally and blocked from preparation until
all remaining items are acknowledged. See example evidence and Windows handoff.
Independent review found source swapping, invalid fields and stale approvals;
regression tests and fixes address them. HTTP assembly jobs remain next-slice work.

Final local verification: 274 Python tests passed, 1 skipped, including the
optional isolated CAD test; one upstream Starlette/httpx deprecation warning.
35 frontend tests passed; production build, Ruff lint/format, pip check and diff
checks passed. Three.js shared bundle still emits Vite's >500 kB advisory.
