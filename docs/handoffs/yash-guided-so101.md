# Windows follow-up: generated CAD/template SO101

Fetch `origin/codex/backend-pipeline` and merge it into your clean Windows feature
branch, preserving current work. This adds a **generated CAD/template candidate**,
separate from the imported reference arm and charger examples. Do not replace
those accepted fixtures. No new Meshy request, recalibration or motor command is
needed for this follow-up.

1. Read `examples/assemblies/so101-guided/README.md`. Extract `bundle.zip` into a
   new output directory. It contains the scene, records and geometry.
2. Run `python -m photo2sim.assemblies validate PATH/scene.xml --report NEW/report.json`
   using your existing simulation environment. A failed check is expected on Mac:
   shoulder pan barely moves, with ~0.974 rad maximum tracking error. Keep the
   original thresholds and retain the actual Windows report.
3. Open the scene in the native MuJoCo viewer. Inspect link grouping and q=0
   appearance, then collision proxies separately. Mac initial contacts show
   four base/shoulder box contacts at approximately -0.019 m distance. Confirm
   which bodies collide; report evidence before changing filtering or proxies.
   This is not yet an accepted dynamic arm demonstration.
4. Run `python tools/assemblies/check_so101_template.py PATH/scene.xml --report NEW/template.json`.
   The three-pose comparison should agree with the pinned reference frames. This
   is template conversion consistency, not physical validation.
5. Optional workbench acceptance: extract `input/meshes.zip` into the example's
   `input/`, create a review package using the README command, run frontend, and
   open `/assembly.html`. Test grouping, pivot/joint edits, acknowledgement
   invalidation and project download. Do not overwrite source/accepted records.
6. Continue the already agreed physical reference evidence independently:
   timestamped whole-arm views plus observations; calibration provenance;
   measured mounting/table placement; actually sent/clipped commands if a later
   operator-approved comparison is recorded. Preserve requested vs sent targets.

Return branch/full commit, versions, reports/screenshots, whether the collision
failure reproduces, and remaining physical mapping evidence. Commit/push only
your findings and necessary scoped fixes; coordinate before touching shared
assembly export or workbench modules. Keep unknown measurements unknown.
