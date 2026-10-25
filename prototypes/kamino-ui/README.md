# Kamino UI prototype

Latest reviewed Kamino interface, preserved as an independent Vite/TypeScript application. It is additive to the repository and can run on another computer without Atul's working directory, credentials, Figma session or browser process.

## Run on Windows or macOS

Install Node.js 22.12+ and pnpm 11.25.0. From the repository root:

```sh
cd prototypes/kamino-ui
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:5188. If the port is already in use, stop the other development server or pass a different port. Dependencies are pinned in pnpm-lock.yaml. No environment file or provider key is needed.

For a production build and local preview:

```sh
pnpm build
pnpm preview
```

## Current UI

- Dark Studio typography; no font toggle or homepage footer.
- White upright mug: orthographic presentation camera keeps the opening rim level and the sides vertical. Workspace retains an orbitable perspective camera.
- Larger opening eases into a reserved capture layout before the phone and photos appear. Grid is subtle and aligned through the mug's actual camera. Cursor glow is restricted to the homepage and disabled for touch/reduced motion.
- Native reversible scrolling. Object pose/progress can stop at any intermediate position. Text and overlays finish their short transitions independently, avoiding invisible headings or half-faded panels when paused. Threshold hysteresis prevents jitter; the page does not automatically snap.
- Local photo selection/drop/removal, cancellable simulated processing, then review/edit workspace with orbit/pan/zoom, wireframe, local embedded GLB replacement and photo lightbox.
- Editable orientation, known full-extent reference axis/length, uniform sizing, mass and optional friction. Manual input remains available. Save explicitly applies the draft before export.
- Revision history and Asset structure are absent from the workspace UI.
- Prepared demo export contains transformed mesh.glb, properties.json and README.txt. It excludes photos and is cached for the saved state.

## Prototype boundary

Photo-to-mesh processing is simulated with procedural demo geometry. Suggestions are fixed example values and require explicit application. Files and saved UI state live in browser memory and reset on reload. There are no backend/provider requests, paid reconstruction, real MuJoCo generation, collision validation or simulation validation. Collision mode is an illustration. The downloaded ZIP is a prototype geometry/properties package, not a validated simulation bundle.

This is a UI delivery, not the completed frontend/backend integration. Use the master's accepted integration source when wiring it up; see HANDOFF.md. The source branch base was c38c95c7211b790dfd7c624f7482b9eaabb0ce58. Existing frontend/backend files are not overwritten by this delivery.

## Checks

```sh
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

The browser command starts a separate preview on port 5189, runs all four check scripts, then stops that preview. Screenshots, downloaded demo ZIPs and result JSON go under ignored evidence/generated/. For an already running server set KAMINO_BASE_URL; the harness will not start or stop that server. KAMINO_BROWSER_EXECUTABLE optionally selects an installed compatible Chromium-based browser; the default uses Playwright's installed Chromium. KAMINO_EVIDENCE_DIR optionally chooses the artifact directory.

Windows overrides, when testing with an existing Edge installation:

```powershell
$env:KAMINO_BROWSER_EXECUTABLE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
pnpm test:browser
```

Committed evidence describes the actual machine and commands used. Windows behavior is verified; a macOS execution is still to be performed. The scripts use portable project/dependency paths and a configurable browser executable.

## Assets

All 33 content/icon assets in public/assets were supplied by the Figma design context and downloaded locally. No temporary Figma asset URL is used at runtime. They are the illustrative mug/photo artwork, not private charger photos. Studio uses local Segoe UI with an Apple system/sans fallback; no proprietary font files are redistributed. No keys, tokens, environment files, original photo archives or generated dependency directories are included.
