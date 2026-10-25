# Kamino · Echo identity

The project remains **Kamino**. **Echo** names the selected symbol: a solid object
with a displaced outline representing its digital counterpart. The lowercase
wordmark is outlined SVG artwork, independent of interface fonts.

![Kamino Echo identity](images/echo-banner.png)

## Palette and typography

| Role | Value |
| --- | --- |
| Brand blue | `#75A7F8` |
| Background | `#0B0C0E` |
| Surface / raised / input | `#121417` / `#1B1E22` / `#202328` |
| Divider | `#2B2E34` |
| Off-white wordmark/text | `#F3F4F6` |
| Charcoal wordmark | `#17191C` |
| Muted text | `#A3A8B1` |

Keep the existing interface font stacks and appearance settings. Do not recolor
coordinate axes, simulation materials, warnings or success states as brand accents.

## Master artwork and use

Canonical files live in [`frontend/src/brand/assets`](../frontend/src/brand/assets).
Use `kamino-lockup-on-dark.svg` on charcoal and `kamino-lockup-on-light.svg` on
white. Black/white lockups, standalone wordmarks and blue/black/white marks are
included. All SVG artwork uses paths with flat fills; no embedded photo, web font,
script or remote dependency is required.

Maintain aspect ratio and clear space around the mark. Headers use a 132 × 35 px
lockup inside a home link at least 44 px high. Narrow project headers use only the
Echo mark; the accessible name remains “Kamino home”. Do not replace letters with
interface text or rename the product Echo.

The selected concept's symbol was redrawn with cubic curves. Letter contours were
vectorized from the selected wordmark and smoothed, preserving its lowercase a.
[Reference identity and palette](images/echo-source.json) identify the source.

## Browser and presentation assets

- SVG favicon with 16/32 px ICO and 32 px PNG fallbacks.
- 180 px touch icon; 192/512 px app icons and a local web manifest.
- `social-preview.png`: 1200 × 630 px, for site sharing and Devpost imagery.
- Transparent PNG lockups and `video-title-card.png`: 1920 × 1080 px.
- [README banner](images/echo-banner.png) and the retained workflow illustration.

Figma/Slides and Devpost should use these files. Their external pages are updated
separately by the team; this repository does not imply those edits were completed.
Existing demo clips and historical packages retain their original evidence.

## Synchronization and exports

Run `node tools/branding/sync-assets.mjs` after changing canonical assets, then
`node tools/branding/sync-assets.mjs --check`. Both frontends contain identical
public copies. Build scripts check them; production needs no image renderer.
`--frontend-only` skips the Python package copy in a frontend-only Docker context.

The portable exporter includes a local blue `kamino.svg` in newly generated rigid
and assembly bundles. Its README resolves the image without the website. Existing
ZIPs and attempt inputs are never rewritten by a branding rollout.
