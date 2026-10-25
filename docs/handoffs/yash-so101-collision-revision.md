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

## Update after stationary take 2 (efa71da)
Johaan fetched and audited the four take-2 files without merging unrelated Windows
branch work. Recorded calibration/hash, 599 complete observations and timestamp
ordering pass offline checks. Pose/photo association and hardware mapping remain
incomplete. The offline audit is available in the same example directory.

Priority order:
1. Complete the front/side photos and operator confirmation for take 2 **only if
   the arm genuinely remained unchanged**. Preserve the original capture and
   summary; add a separate pairing.json recording image paths, capture/take ID,
   image times if known, operator confirmation and the association method. Do not
   label separate photographs hardware-synchronized. If the pose changed or is
   uncertain, retain take 2 as unpaired and pair a fresh capture with photographs
   using the established workflow. Do not run more unpaired captures.
2. Run the revised generated-SO101 Windows checks above while hardware is idle.
   This does not require new robot motion.
3. Report measured mounting/table placement and jaw opening where available.
   For additional distinct poses, use the human operator's established controls;
   preserve each pose's observation/photo association. Never send simulation zero
   or guessed signs/offsets to hardware. One stationary pose cannot resolve them.

Return paired evidence or explicit missing items, plus revision validation/viewer
results. Continue preserving calibration and requested-versus-sent distinctions.
