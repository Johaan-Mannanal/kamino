# Kamino release-readiness implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. The user approved this scope in chat.

**Goal:** Let a new visitor understand Kamino and reproduce a complete output without provider access.
**Architecture:** Reuse the hinged-panel bundle and existing validation CLI. Add static example/404 pages to the current Vite/Caddy build and small responsive fixes.
**Tech Stack:** Python 3.13/MuJoCo 3.3.7, TypeScript/Vite/Three.js, pnpm, Playwright, Caddy 2.10.2.
**Spec:** `docs/superpowers/specs/2026-10-26-release-readiness.md`.

## Global constraints

No portfolio, paid provider, hardware, licensing grant, destructive cleanup or production write. Preserve frozen artifacts and the corrected robotics story.

## Review focus

- Static example assets must survive the combined production build and download byte-identically.
- Missing frontend URLs must remain HTTP 404; backend API failures must keep API semantics.
- Desktop-to-phone resize must not let the assembly canvas dictate viewport width.
- A visitor must see access restrictions before selecting/uploading photos.
- The example must run from fresh dependencies and an extracted/relocated directory.

## Task 1: Documentation, example and licensing preparation

- [ ] Rewrite README/contributor guide, add docs index, quickstart, complete example, access, license options/inventory and release notes.
- [ ] Freeze the freshly installed Intel Python environment as platform-specific constraints; reinstall into a second environment from those constraints.
- [ ] Run the unchanged hinged-panel ZIP through the existing assembly validation CLI and relocation checks; retain checksum.

## Task 2: Site entry points and recovery

- [ ] Add browser checks for first-screen example links, access disclosure, portable download, 390px assembly layout and 404/API separation; observe failures first.
- [ ] Add static example/404 pages, package existing example assets in the build, expose first-screen links and update access copy.
- [ ] Fix grid/canvas shrink behavior; use Caddy's error handler for static 404 recovery.
- [ ] Re-run focused browser checks and all frontend/backend suites; build both frontends and assemble the deployed layout.

## Task 3: Review and delivery

- [ ] Check links, artifact hashes, fresh environment evidence, lint and formatting.
- [ ] Obtain a fresh whole-branch review; fix significant findings with regression coverage.
- [ ] Commit and open a reviewable PR. Leave license selection, merge/deployment and tagged publication explicit.
