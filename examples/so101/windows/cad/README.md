# User-supplied SO101 CAD reference

Received 2026-10-24 from Yash as `SO101 Assembly.step`. The original is preserved
byte-for-byte inside `so101-assembly-reference.zip` (ZIP compression only).
Upstream URL and license provenance have not yet been provided; do not infer
that this is the exact revision of the pinned MuJoCo model or installed arm.

Header: `SO101 Assembly v4.step`, Autodesk Translation Framework v14.4.0.0,
AP214, export timestamp 2025-04-15T13:10:53+02:00. Text inventory finds 214 PRODUCT
records, including base, upper/under arm, follower wrist and moving jaw. See
`inventory.json` for product names, unit declarations and original SHA-256.

Both metre and millimetre unit declarations occur. Resolve representation units
with a CAD importer before measurements/conversion. No CAD kernel was available
in the simulation environment, and no packages were added. This is header/text
inspection, not geometric validation. Dimensions from this file will be nominal;
physical link revisions, base/table mounting and camera/gripper modifications
remain unverified. CAD does not supply LeRobot zero/sign calibration or table pose.

Extract on the other computer with PowerShell:

```powershell
Expand-Archive -LiteralPath examples/so101/windows/cad/so101-assembly-reference.zip -DestinationPath outputs/so101/cad-reference
Get-FileHash -Algorithm SHA256 -LiteralPath 'outputs/so101/cad-reference/SO101 Assembly.step'
```

Expected original SHA-256:
`f754be35708382b05ce65768ae33c612f91dca11ad19d14807dc637eb944ba3d`.

Next: open in an available CAD application, resolve units/assembly placements,
extract nominal link/mount dimensions and compare to the pinned model; ask the
operator to confirm physical differences. No hardware motion is required.
