# Experimental preview — v0.1.0-preview.1

This first GitHub prerelease packages a small, reproducible example of Kamino's
assembly/export workflow. It accompanies the current photo workspace and guided
component-mesh assembly tools. Original Kamino code, documentation and synthetic
examples use [Apache-2.0](../../LICENSE); [NOTICE](../../NOTICE) and
[third-party terms](../THIRD_PARTY.md) remain part of redistribution.

## Source and verification

The application source is
[`a7dff7f`](https://github.com/Johaan-Mannanal/kamino/commit/a7dff7f86f75c2251e3d27e5300d1bcf3c0a66b2).
The release tag also includes the accompanying publication documentation.
[CI on that application commit](https://github.com/Johaan-Mannanal/kamino/actions/runs/40511013407)
passed all four jobs:

| Check | Result |
| --- | --- |
| Backend | 501 passed, 2 optional skips; existing Starlette/httpx deprecation warning |
| Shared frontend / Workspace | 150 / 164 passed; both typechecks and production builds passed |
| Combined-site browser acceptance | 12 passed, including automatic student access, saved-job links, judge upgrade, Assembly, mobile layout, downloads and shipped license files |
| Containers | Both image builds and mock pipeline/persistence checks passed |
| Python lint/format | Ruff passed |

Staging and production each passed 18 hosted checks for sessions, origin checks,
unchanged student limits, license files, the example and Assembly. The public
site's upload page was also checked in a browser. These acceptance checks created
no generation jobs or provider requests. Runtime/deployment identities are in
[the release index](../RELEASE.md).

## Attached example

The curated synthetic-example download includes the unchanged hinged-panel
`simulation.zip`, generated box inputs, reviewed project, assumptions and selected
validation reports, plus LICENSE and NOTICE. A fresh headless check passed for
both its original location and a relocated copy with MuJoCo 3.3.7 / NumPy 2.5.4.
The verification receipt records its scope; no native-viewer or physical-hardware
acceptance is claimed.

The nested `simulation.zip` remains byte-identical, SHA-256
`53eeea937514a491d33bd9b98ec5ffb8cc5419cc9b46791b8c9b1cad5fa913eb`.
The attached `SHA256SUMS` covers the release downloads. See
[the complete example](../COMPLETE_EXAMPLE.md) and [tested local setup](../QUICKSTART.md).

Only original synthetic material is selected for the additional release assets.
No provider-generated models, supplied CAD, photos, recordings, design/media,
dependencies or private backups are added to those downloads. GitHub's automatic
source archives contain the full tagged repository; they retain the separate
licenses and unresolved redistribution questions in the [inventory](../THIRD_PARTY.md).
They are not a blanket rights clearance for every repository asset.

## Hosted access and limits

The public site provides student access automatically. Its 30-minute sessions
share a rolling allowance of 2 mesh submissions, 10 Gemini requests and 10
simulation submissions per 24 hours, with existing cooldowns. Judge and team
access use codes. The [offline example](../COMPLETE_EXAMPLE.md) is independent of
hosted access; [photo handling and shared access](../HOSTED_ACCESS.md) are documented.

## Known limits

- Experimental project; no SLA or guaranteed support cadence.
- Reconstruction can invent shape or surroundings. Physical properties,
  collision geometry and inertia may be approximate and need review.
- The example uses synthetic inputs and assumptions, rather than photographs or
  measured real-world dynamics.
- Browser mobile checks use Chromium emulation, rather than native-device certification.
- The team reports an SO-101 leader → simulation review/adjustment → exported
  follower execution workflow with human iteration. A complete hardware runner
  and export-to-measured-execution receipt are not published. The README media
  is recorded arm replay with scripted charger motion beside physical footage,
  manually aligned for presentation. See [the robotics scope](../ROBOTICS_DEMO.md).
  Precise calibration and contact-rich manipulation remain ongoing work.

Earlier results remain in [RELEASE.md](../RELEASE.md) with their original scope.
