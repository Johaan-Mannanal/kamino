# Assembly API/workbench integration

Integrated Atul's `codex/assembly-job-api` at
`01a6af5f6b62285217c43e90abffb4f67cc12355` into `codex/backend-pipeline`.
Source branches and main preserved. See [browser evidence](../../examples/assemblies/api-browser-macos/README.md)
for the actual authenticated synthetic import → review → save revision → process
→ download → extracted/relocated validation. This closes the generic HTTP wiring
gap; physical SO101 comparison still requires Yash's pose evidence and mapping.

Integration fixes: CORS PUT preflight, pending-save snapshots, duplicate mutation
blocking, stale response guards, failed-load preservation of local work, interrupted
revision retry, and exact pinned source bytes across Windows Git checkouts.
Regressions were reproduced before fixes. Final 308 Python passes/2 optional skips,
42 frontend passes and production build; existing dependency/chunk-size warnings
remain. No provider calls, hardware access or cloud deployment.

## Atul / Windows retest

Fetch and merge the pushed `origin/codex/backend-pipeline` into your clean feature
branch, preserving uncommitted work. No new feature implementation is required
for this handoff. Re-run your full Python suite and frontend tests/build.

The source-hash failure came from Git converting pinned files to CRLF, including
`so101.xml`, `scene.xml`, `README.md` and `LICENSE`. The new scoped `.gitattributes`
preserves bytes for all 20 manifest entries. It does not change the model or hashes.
Existing working files may still contain old CRLF bytes. Check the four paths with
`git status --short` and `git diff --` first. **Only when they have no local edits**,
refresh those paths from the merged commit:

```powershell
git restore --source=HEAD --worktree -- third_party/robotstudio_so101/so101.xml third_party/robotstudio_so101/scene.xml third_party/robotstudio_so101/README.md third_party/robotstudio_so101/LICENSE
```

If any path has local edits, preserve them separately and report instead of restoring.
Never disable hash checks, rewrite SOURCE.json or alter acceptance thresholds.

## Yash / next acceptance

Continue pending stationary photo pairing and hardware-to-model mapping evidence.
The new assembly job workflow is available for an independent Windows synthetic
browser check using the tracked acceptance input. Use the generated SO101 candidate
only with its explicit convex collision, adjacent-pair exclusions and assumed
free-space clearance; do not silently apply those assumptions to physical mounting.
A full SO101 browser/API export and Windows acceptance remain a next step; this
handoff's live browser evidence is the synthetic two-link case. No repeated Meshy
job or charger verification is needed.
