# Exact-commit Windows acceptance evidence

Tested application commit: `a834763920176f34cafd07a49aa5ea9064bdc545`.

Result: **BLOCKED — 20 PASS, 8 BLOCKED, 0 checklist FAIL, 0 NOT RUN**. Original native backend-suite result remains 25 failed / 365 passed / 7 skipped; the separate short-temp diagnostic passed the 25 failed cases without waiving them.

Read [Johaan's handoff](../../../docs/handoffs/windows-acceptance-results-20261025.md), [run-record.md](run-record.md) and [final-summary.json](final-summary.json).

Download `windows-acceptance-a834763-evidence.zip` using GitHub's raw/download action and verify `windows-acceptance-a834763-evidence.zip.sha256`. The archive is 52,006,310 bytes; SHA-256 `987d8c00cd6784f33a18629f0beba78a582ef0c9347063fe8b4e0f74898ebc7b`. It contains 267 payloads plus `MANIFEST.json`, verified by CRC and per-file SHA-256.

Extract into an empty folder. Evidence paths in the record resolve relative to that extracted folder; the adjacent `MANIFEST.json` is a readable copy of the archive's payload manifest. `exports/A.zip` and final `exports/B.zip` are actual browser downloads. Earlier B and re-downloads of A are preserved. `can-fixture.zip` contains immutable original investigation evidence; extract it separately if inspecting original/manual history.

Local machine paths in logs are historical provenance, not prerequisites. The exported simulation has local asset references and includes its own runner/instructions. Use an installed MuJoCo runtime. Physical accuracy, grasp accuracy and complete multi-angle shape inspection remain unverified.

This publishing branch adds results and documentation only. It does not modify application code or authorize deployment.
