> Historical initial UI handoff. Integration is complete; use [the current README](README.md) and [release index](../../docs/RELEASE.md). Pending items below describe the original delivery only.

# Master handoff: Kamino UI

The latest UI is in prototypes/kamino-ui as an additive, self-contained project. The branch is codex/kamino-ui-prototype. It starts from remote codex/backend-pipeline at c38c95c7211b790dfd7c624f7482b9eaabb0ce58; it does not replace the accepted combined sizing/Gemini source or merge deliveries again. Cherry-pick the UI delivery commit onto the accepted integration source when ready.

## Continue on another computer

```sh
git fetch origin codex/kamino-ui-prototype
git switch -c review/kamino-ui origin/codex/kamino-ui-prototype
cd prototypes/kamino-ui
pnpm install --frozen-lockfile
pnpm dev
```

Follow README.md for build/test/browser checks. All UI assets, source and the dependency lockfile are committed. Atul's machine and its localhost server are not needed.

## Backend wiring still required

1. Replace the simulated processing timer with the existing upload/job adapter. Send repeated multipart images fields and follow actual status. Enter the workspace only when geometry is ready/awaiting properties; preserve selected photos and manual input on errors.
2. Replace procedural geometry with authenticated job-file loading. Keep bearer tokens out of URLs and provider keys out of the browser. Reuse existing GLB resource restrictions and cancellation/disposal behavior.
3. Treat accepted sizing/orientation contracts as authoritative. Use the actual sizing-preview endpoint with reviewed orientation, source hashes and full-extent correspondence. The local preview and backendProperties() mapping are UI examples, not server validation.
4. Connect suggestions to the accepted Gemini suggestion service/error contract. Preserve sanitized categories, manual entry, actual-model/fallback provenance and server cache behavior. Applying suggestions must remain explicit.
5. Save properties and explicitly request simulation preparation through the existing API. Replace the prototype ZIP action with the actual prepared-bundle download, enabled only for the appropriate completed/validated state. Distinguish export generation from validation success. Retain accepted sizing, regeneration, replay/mapping and previous-attempt semantics even though no revision-history panel is shown in this UI.
6. Preserve the assembly workflow and existing frontend entry points. This change deliberately does not overwrite frontend/src/main.ts, API files or sizing/replay implementation.

## Accepted presentation details

Studio typography; no font switcher, homepage footer, closing slogan, workspace Revision history or Asset structure. White upright large mug, camera-aligned subtle floor, homepage-only glow, separate phone/photo clearance, free scrolling with readable paused states. Mobile and reduced-motion views use static editorial content.

No live provider calls, private charger-photo transfer, reconstruction, deployment or sponsor work is included. Check evidence/portable-verification.json for actual final validation of this portable copy. A separate machine/macOS run is the remaining portability check.
