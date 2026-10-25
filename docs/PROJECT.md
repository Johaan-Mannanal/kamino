# Current project scope

Kamino's public main now contains the released photo-to-simulation application.
See [README](../README.md) for the workflow and setup and [release evidence](RELEASE.md)
for exact source identities. Historical team handoffs retain their original results;
their old “pending” statuses and branch instructions are not the current release plan.

## Released

- Photo upload with optional crop, Meshy reconstruction and retained original inputs.
- Whole-reconstruction viewer with source photos, Studio/Mesh, camera reset and preserved orbit/pan/zoom.
- Reviewed orientation and one uniform reference scale; derived extents and editable mass/friction.
- Gemini assistance with estimated provenance, protected drafts and explicit saving.
- Persistent jobs, correction/regeneration, immutable earlier attempts and portable MuJoCo exports.
- Optional rigid/link collision geometry, twist/rolling friction, COM/inertia and contact presets.
- Separate component-mesh assembly workbench with reviewed links/joints, sliders,
  springs, linked motion and saved revisions; browser motion is kinematic.
- Mobile scroll presentation with reduced-motion support and stage-aware reconstruction progress.
- Railway-hosted frontend/backend and HTTPS at kamino.design; session access limits provider spend.

## Demonstration boundaries

Synthetic demo geometry, imported/CAD reference models, reconstructed meshes and
physical observations are distinct evidence types. Observation-driven SO-101
playback and a scripted charger presentation are separate from the website.
Physical mapping/alignment, contact fidelity and grasp transfer remain unverified.
No simulation-to-arm execution claim is made by this release.

The photo workspace does not ship optional CAD uploads or automatic parameter
correction. Low-level CAD utilities and examples are research tools. No immediate
new-feature commitment follows from their presence in this repository.

## Publication priorities

1. Keep the released source, setup and limitations reproducible on public main.
2. Complete accessible Figma evidence and resolve the Microsoft agent-eligibility question.
3. Prepare an accurate submission, short pitch and locally stored demo video.

[Current sponsor scope](SPONSORS.md): Gemini, Figma, GoDaddy Registry and conditional
Microsoft track fit. Bright Data/Apify were removed; Fetch/Vultr are historical.
Preserve deployment availability and rollback artifacts. Never overwrite old
acceptance evidence to make it appear to cover a later commit.
