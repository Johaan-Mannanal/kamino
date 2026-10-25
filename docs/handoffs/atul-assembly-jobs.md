# Atul: connect guided review to assembly jobs

Fetch and merge `origin/codex/backend-pipeline` into a clean feature branch,
preserving existing work. Johaan owns simulation collision/export/inspection
changes. You own assembly job/API integration and frontend wiring; coordinate
before changing shared assembly contracts or simulation modules.

Build the smallest usable workflow: import a review project plus its local source
meshes; open guided review; save revisions; prepare/export/validate; download the
result. Start with the synthetic two-link fixture. Reuse the assembly library and
workbench. Do not invent photo-based link/joint inference.

Preserve authentication, source hashes, portable paths, provenance and review
snapshots. Treat uploaded archive paths and symlinks as untrusted. Bound file and
expanded archive sizes; do not execute imported code. Keep attempts separate and
retain failures. Distinguish export creation from passed motion validation. The
existing rigid-object upload/processing/download flow must continue working.

Keep source review data separate from export configuration. `export_assembly`
now optionally accepts `collision_mode="convex_mesh"` and
`exclude_joint_pairs=True`; defaults remain the historical box/native behavior.
These options are recorded in simulation.json. A generated SO101 free-space
scenario also changes root height to 0.15 m, explicitly assumed; do not silently
apply that mounting height to arbitrary uploaded objects or physical comparisons.

Do not edit assemblies/contracts.py, export.py, inspection.py, validate.py or
SO101 example evidence without coordination. No provider jobs, deployment or
hardware commands are needed. Test authentication, invalid imports, stale review,
retry/failure artifacts, successful synthetic export and browser download.
Commit/push your feature branch and return full SHA, API contract, tests, evidence
and remaining gaps. Do not merge main.
