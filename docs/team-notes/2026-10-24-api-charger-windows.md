# API-generated cleaned charger ZIP verified on Windows — Yash

Source branch `codex/backend-pipeline` at `2ceb12176287c9ab26cc35d6b548160506937573` merged
into the simulation feature branch; main and previous work preserved. Final chat contains pushed SHA.

Actual API-produced ZIP passes Windows original/relocated validation unchanged: 3 simulated s,
0.0001 s timestep, penetration 0.451507 mm, settled, no warnings. Total wall time 3.067 s.
Native viewer briefly inspected expected body/two upward pins/no slab and stable rest, zero warnings.
API vertices differ from the accepted manual candidate by at most 1.01915e-17 m; faces and box
physics match. Saved 90-degree X orientation persists. Dimensions/mass stay estimated and collision
stays a single bounding box. ZIP hash matches backend receipt; extracted payload unchanged.

No new provider job or demo recording needed. Existing cleaned drop/reset demo remains applicable.
Windows versions: Python 3.12.10 / MuJoCo 3.17.0 / trimesh 5.2.0 / NumPy 2.5.4.
Focused orientation tests 11 passed, Ruff/format/pip checks pass; upstream deprecation warning only.
[Full actual results, screenshot and commands](../../examples/simulation/apple-20w-charger-cleaned/api-acceptance/WINDOWS.md).

Windows API-bundle verification is complete for coarse-box demo scope. Preserve estimated labels
and lack of per-pin contact/physical-fidelity claims. Frontend orientation controls are separate.
