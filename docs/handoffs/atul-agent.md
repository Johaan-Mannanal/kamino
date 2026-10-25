# Instructions for Atul's AI agent

> Historical handoff. Current scope and responsibilities are in [PROJECT.md](../PROJECT.md);
> current Windows work is in [yash-articulated-demo.md](yash-articulated-demo.md).
> Preserve this note as context, not a new task assignment.

You own the web workflow for **Photo2Sim**, a Cal Hacks project turning object photos into editable MuJoCo assets. You are working alongside three other agents; preserve their work and stay in your scope.

## Get the code

If you do not have a clone:

```bash
git clone https://github.com/Johaan-Mannanal/photo2sim.git
cd photo2sim
```

For an existing clone, inspect `git status --short` and preserve local changes. Then:

```bash
git remote set-url origin https://github.com/Johaan-Mannanal/photo2sim.git
git fetch origin
git switch -c codex/web-workflow origin/codex/backend-pipeline
```

If the branch exists, inspect/reuse it. If the checkout is dirty, leave it intact and use a separate worktree. Start from **origin/codex/backend-pipeline**, which carries the shared contracts; main may not contain them yet.

Read README.md, docs/PROJECT.md, **docs/API.md**, and docs/SPONSORS.md.

## Your deliverable

Own **`frontend/`** including its dependencies/configuration and tests. Use a small Vite/TypeScript application on port 5173; choose UI details locally and keep the interface focused. Later own `src/photo2sim/integrations/fetch_agent/` and its dedicated tests. Backend Python code and shared schemas belong to Johaan.

1. Build a complete flow against clearly labeled mock API responses: choose 1–4 photos, upload, show reconstruction progress, confirm dimensions/mass, display available results, and download artifacts. Include empty, loading, awaiting-input, failed, and completed states.
2. Use the exact endpoints/JSON in docs/API.md. Upload under repeated multipart field `images`; let the browser set Content-Type. Poll jobs while running; stop at input/error/terminal states. Keep API base URL configurable. Once the backend is available, use its `/openapi.json` and real local mock-provider jobs.
3. Show units clearly and convert mm/g to m/kg explicitly if accepting those inputs. Preserve measured/user-supplied/sourced/estimated labels; unknown friction stays empty. Explain which stages remain unfinished. Show synthetic/provider labels prominently. Never display an export as completed simply because reconstruction reached 100%.
4. Render a GLB preview if feasible; start with reliable artifact links and property editing. Hide unavailable downloads/actions. Handle validation, provider failure, and network errors without losing selected inputs.
5. Verify the flow in a browser with responsive layout and useful error states. Document install/dev/build commands and mock-vs-live mode. Commit the frontend lockfile.
6. After the core flow works, implement Fetch/ASI:One integration using the SAME backend API, following the sponsor checklist. Verify current official Agentverse/ACP requirements. Do not duplicate reconstruction/geometry logic or claim sponsor qualification before testing the actual integration.

Srijan owns geometry preparation; Yash owns MuJoCo export. Do not edit their modules, shared contracts, root dependencies, or backend routes without coordination. Mock downstream preparation/export until those parts land; identify mocked results clearly.

Commit and push your feature branch; do not merge main or other branches automatically. Finish with **“Send to the other computer”**: branch, full SHA, push status, Node/package-manager versions, commands, changed files, browser/build results, screenshots if useful, mocked functionality, blockers, and the next integration step. Push small needed fixtures; local paths alone do not transfer files.
