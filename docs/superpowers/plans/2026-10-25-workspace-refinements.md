# Workspace refinement integration

Base: a834763920176f34cafd07a49aa5ea9064bdc545. Work only in codex/workspace-refinements; frozen checkout and hosting remain unchanged.

1. Add regression tests to backend-session.test.ts for cached-first suggestions, 404-only automatic POST, session deduplication and stale same-job reopen responses. Implement through existing generation/serial guards in backend-session.ts. Keep provider fallback policy server-side.
2. Add DOM/session tests for explicit Save & generate / Save & retry, preview-save-process order, failed save, intervening edits and target invalidation. Compose saveReviewed and process; preserve target review, reference binding, histories and polling.
3. Port fixed-preview/scrolling-inspector layout into live-workspace.ts and style.css. Keep explicit field/axis choices, provenance, readable review gates, target controls and historical downloads. Restore Home scrolling on disposal.
4. Run both frontend suites and builds, inspect desktop/mobile locally with mock-only data, and review the diff against the frozen SHA. Record candidate identity and remaining Windows/hosted acceptance separately. Do not deploy or push.
