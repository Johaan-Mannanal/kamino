# Experimental release preparation

Status: **prepared for review**. Original Kamino material is licensed under
[Apache-2.0](../../LICENSE); publication still requires applicable
[third-party permissions](../THIRD_PARTY.md) for every included asset.

## Scope

Photo reconstruction/review/export, saved correction history, and guided
component-mesh assemblies. The separate SO-101 prototype demonstrates trajectory
transfer with human iteration. Precise calibration and contact-rich manipulation
remain ongoing work. No new robot commands or provider calls are part of this pass.

## Example asset

Reuse `examples/assemblies/hinged-panel/simulation.zip` unchanged, with its
`SHA256SUMS`, [guide](../COMPLETE_EXAMPLE.md), assumptions and retained reports.
Its synthetic inputs demonstrate assembly/export, not photo reconstruction.

## Tested setup and checks

Use [QUICKSTART.md](../QUICKSTART.md) and `constraints/macos-intel-py313.txt`.
Fresh verification on Intel macOS / Python 3.13.7 / MuJoCo 3.3.7:

| Check | Result |
| --- | --- |
| Second clean install using constraints | Dependency versions matched exactly |
| Full backend suite in that environment | 492 passed, 2 skipped; existing Starlette/httpx deprecation warning |
| Shared frontend / Workspace | 143 / 163 passed; both typechecks and production builds passed |
| Focused assembled-site browser checks | 10 passed, including both local Vite apps' example pages/downloads, 320/390px entry and desktop-to-phone canvas resize |
| Example | Actual extracted ZIP passed motion and relocation checks |
| Python lint/format | Ruff passed |

The original example ZIP remains byte-identical, SHA-256
`53eeea937514a491d33bd9b98ec5ffb8cc5419cc9b46791b8c9b1cad5fa913eb`.
Both builds retain Vite's existing large-chunk warning. Browser checks use a local
fixture API, no provider calls and no hardware. CI now runs the focused site checks;
its remote result is separate from the local results above. Earlier release
counts remain in [RELEASE.md](../RELEASE.md) with their original scope.

## Known limits and maintenance

- Experimental project; no SLA or guaranteed support cadence.
- Hosted reconstruction requires a team-issued code; offline example is independent.
- Reconstruction can invent shape or surroundings; properties and collision/inertia may be approximate.
- Browser mobile checks use Chromium emulation, not native-device certification.
- Local checks and a PR do not imply a staging or production deployment.

Tag the reviewed merge commit, attach the example/checksum, include these limitations
and actual verification receipts, and publish the experimental GitHub release. Include
the root LICENSE and NOTICE and preserve applicable third-party notices. Do not tag a
different source while reusing old results.
