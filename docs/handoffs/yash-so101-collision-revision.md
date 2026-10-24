# Yash: validate the revised generated SO101

Fetch/merge origin/codex/backend-pipeline into your clean Windows feature branch,
preserving existing work. Continue physical reference/mapping work independently.
No new motor command, recalibration, Meshy job or charger test is requested here.

Extract examples/assemblies/so101-guided/collision-revision/bundle.zip into a NEW
output folder. Read its README first. This is the generated CAD/template-assisted
assembly, not the imported reference scene. Original failed evidence is retained.

Run with your simulation interpreter, replacing NEW with the extraction path:

```powershell
python -m photo2sim.assemblies validate NEW/scene.xml --report outputs/so101-convex-windows.json
python tools/assemblies/check_so101_template.py NEW/scene.xml --root-z-offset 0.15 --report outputs/so101-convex-fk-windows.json
```

Inspect the new scene in the native MuJoCo viewer. Check grouping, convex collision
shapes, joint-adjacent exclusions, and ground/nonadjacent contact enablement. Run
the same target sequence/reset and capture native evidence if practical. Report
actual tracking errors, warnings and differences; preserve thresholds/parameters.

Mac passes motion, limits, repeatable resets and relocation, max final error
0.000617 rad against 0.03 rad tolerance. Root height is now an **assumed 0.15 m
free-space test placement**, not measured physical mounting. The old 0.05 m scene
had a half-limit target below the floor. Do not adopt the test height for the real
comparison without measuring placement. Hulls fill concavities, adjacent contacts
are excluded, and inertia/actuators remain approximations.

Return branch/full SHA, versions, reports and viewer evidence. Separately report
progress on joint signs/zeros, gripper conversion, timestamped pose observations
and measured base/table geometry. No physical accuracy claim follows from this
numerical pass alone. Do not modify shared exporter/validator without coordination.
