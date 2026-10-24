# Portable exports and collision review

Approved scope: make downloaded exports useful without the repository, and expose
collision approximations alongside geometry before assembly processing.

1. Add shared bundle support files to rigid and assembly exporters: README,
   requirements pin/environment metadata, readable assumptions, standalone runner.
   Headless runner is an independent load/finite-state smoke check, not full
   application validation. Native mode supports visual/collision geom visibility.
   Preserve metadata, defaults and thresholds; export stays transactional.
2. Add assembly preview toggle for per-link boxes/convex hulls matching current
   export settings, in link-local coordinates and animated by existing joint
   transforms. Label filled concavities/excluded pairs and lack of contact solving.
   It previews the current draft, not a historical attempt. No new physics inference.
3. Test relocated exports in isolated Python without repo imports; test rotated,
   grouped geometry bounds and collision motion transforms. Browser-check box/hull
   overlay and complete export/download; save evidence and update docs.
4. Run full tests/build/lint, review, commit/push the authorized feature branch.

No provider calls, hardware commands, deployment or physical calibration required.

## Completion evidence
- Standalone runner tests first failed on absent support files, then passed for
  rigid and articulated exports after relocation with isolated Python invocation.
- Collision tests cover multi-part local bounds with rotated group frames, omitted
  parts, convex vs box volume, joint motion and empty-link warnings. UI control
  test first failed on absent toggle, then passed without changing acknowledgements.
- Browser checked box overlay at 0.6 rad, convex policy, reset and preserved reviews.
  Saved revision 4 / attempt 3 passed and downloaded; server/archive bytes matched.
- A new MuJoCo-only virtual environment (no Photo2Sim package) ran the extracted
  archive from another working directory: ~3 simulated seconds, finite state,
  zero warnings. Evidence: examples/assemblies/portable-review/.
- Full checks: 317 Python passed, 2 optional skips; 58 frontend passed; build,
  Ruff lint/format and diff checks passed. Existing dependency deprecation and
  Vite chunk-size warning remain. Native GUI and Windows runner acceptance pending.
- Independent read-only review found no material issues; native scene-update probe
  confirmed the convex-hull flag affects collision geometry while preserving visuals.
