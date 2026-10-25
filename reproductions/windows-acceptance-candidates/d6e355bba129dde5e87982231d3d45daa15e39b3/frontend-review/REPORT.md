# Candidate frontend verification

Exact source SHA: d6e355bba129dde5e87982231d3d45daa15e39b3. Windows native, Node v24.20.0. Candidate checkout remained clean; no application source edited.

- Workspace: 119 tests passed across 7 files; TypeScript noEmit passed; production build passed.
- Legacy frontend: 103 tests passed across 18 files; TypeScript noEmit passed; production build passed.
- Existing large-bundle warnings retained (Workspace 752.87 kB main JS; legacy 556.00 kB OrbitControls shared chunk).

Commands used from respective candidate project directories: node node_modules/vitest/vitest.mjs run --configLoader native; node node_modules/typescript/bin/tsc --noEmit; node node_modules/vite/bin/vite.js build --configLoader native. Workspace initial passing test run used the equivalent explicit .pnpm vitest path.

Dependencies were copied read-only from the original acceptance checkout; no network install or provider call. Robocopy dereferenced package junctions. Initial command attempts failed module resolution; logs are retained. An offline pnpm install attempt was rejected by sandbox symlink permissions before package installation. Restored candidate-only vite/vitest junctions to candidate .pnpm package folders (four junctions; no originals changed), then reran checks successfully. Use *-rerun.log as authoritative test/build results and *-exits.json for final exit statuses.

Focused regression review: backend-session.test.ts 996 covers unsaved preview caption changing to saved sizing, same scale, same viewer key (no reload). Adjacent tests cover edits during pending Save staying dirty and generation blocked, and late preview responses rejected. Other tests cover target edits while review save pending, unsaved drafts across refresh/remount, stale contexts and explicit request/apply/save behavior.

These automated checks do not establish manual browser refresh/discard or native multi-angle inspection.
