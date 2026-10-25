# Kamino sizing/Gemini checkpoint

Published checkpoint branch: `codex/kamino-sizing-gemini-checkpoint`.

This reconstructs accepted source d4107843 on c38c95c, applies the 25 compatible
Kamino branding files, and reconciles the five documentation files from current
master docs. It does not import Atul's separate Figma layout or the mixed shared
checkout. The original integration worktree, charger/can inputs, d410 manifests
and evidence archives are unchanged.

Branded source identity:
`d5910b7b127f86769aef66bd8828a5024c9061313ac467cca3fac56f4fca5826`.
This is the canonical 515-file path/hash identity under
`outputs/checkpoint-acceptance/source-manifest.json`; the checkpoint commit supplies
its complete Git identity, including this handoff and the execution plan.

Inputs: accepted sizing/Gemini source
`d4107843fcd8d6fe3d5c8aa087a7a3960ee32e2e1b0c3689eb16e31f1be3abf1`,
Gemini delivery `057ea6333d9ed383ed0c878c8da3f6aee1f5550e`, branding patch
`09d983a4d786c7e8268bc54edddc3500011726cecaeb35f76ad67feb6b118386`.
Latest master doc hashes are retained in the local acceptance inputs record.

Exact-source checks: full Python **378 passed, 2 skipped** (optional ACP module
and isolated CadQuery), 198.08 seconds; frontend **86 passed across 16 files**;
production build, Ruff check and format (**192 files**), and diff whitespace passed.
The existing Starlette/httpx deprecation and large viewer-chunk advisory remain.
Python 3.13.7 / MuJoCo 3.3.7 / Node 22.19.0 / pnpm 10.15.1. Logs are retained under
`outputs/checkpoint-acceptance/`. No real provider or reconstruction calls occurred.

Compatibility names remain `photo2sim`, `PHOTO2SIM_*`, current saved format IDs
and API routes. Only future export prose/model display names use Kamino; historical
exports and hashes were not rewritten. Physical fidelity is not certified by
this software checkpoint. The bounded island-selection/review implementation
starts on a separate branch, not this checkpoint.
