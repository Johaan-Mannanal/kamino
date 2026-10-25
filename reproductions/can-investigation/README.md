# Can investigation reproduction archive

Archive: `can-investigation-f84d7763-20261025T030318Z.zip` (41,085,127 bytes).

SHA-256: `e828bb548dae9e5828a29689f2e91c96f4069ee4c6aa8b5788a5700d2d01db6d`.

This branch adds the reproduction archive, its checksum and this README. The application changes remain uncommitted in the original local checkout; this is an archive handoff, not a software fix.

## Find and download

Repository: https://github.com/Johaan-Mannanal/photo2sim
Branch: `codex/can-investigation-handoff`
Folder: `reproductions/can-investigation/`

From a clean checkout:

```powershell
git fetch origin
git switch --track origin/codex/can-investigation-handoff
```

Alternatively, open the branch on GitHub, navigate to this folder, select the ZIP and click **Download raw file**. If the branch already exists locally, use `git switch codex/can-investigation-handoff` after fetching.

## Verify and reproduce

Verify the ZIP with `Get-FileHash -Algorithm SHA256` and compare it to the checksum above. Extract into a new folder, then run `python verify_package.py`. See the included README for offline reproduction instructions.

The archive contains the original three uploaded JPEGs, untouched raw GLB, pre-repair job and properties/orientation, complete original attempt including ZIP and validation report, manual derivative and repair log, diagnostic images, source snapshot and dirty patches, runtime versions, and file hashes.

The original incorrect export is preserved separately from the current manually corrected job. No new reconstruction or repair was performed to package this archive. Credentials and all `.env` files/templates are excluded, including from nested ZIPs. Original photo metadata and scene backgrounds are intentionally retained for reproduction; treat this archive as private.
