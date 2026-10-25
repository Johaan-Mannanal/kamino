# Next team steps after frontend integration

## Atul — send to your agent

Continue on `codex/web-workflow`, preserving current work. Johaan integrated your `7e89262` into `codex/backend-pipeline`. Fetch and merge the pushed integration branch when your checkout is clean; keep new frontend/Fetch changes on your feature branch.

1. Add a GLB viewer using the job's `mesh_path`, authenticated fetch and Blob loading. Preserve the existing in-memory application token and authenticated downloads. Show loading/failure states and release obsolete object URLs/resources.
2. Connect `POST /api/jobs/{id}/suggestions` and cached `GET`. Read `docs/API.md` for payloads and errors. Show estimates, notes and questions; applying suggestions and saving confirmed properties must be explicit. Preserve manual drafts on failure, and leave manual entry available on busy/unavailable responses. Do not expose provider keys.
3. Reconcile the adapter's actual `AGENT_SEED_PHRASE` variable with the older `FETCH_AGENT_SEED` checklist. Document one canonical name and generate one stable private seed, avoiding duplicate identities. Do not commit or include the seed in handoffs. Johaan has an Agentverse API key available privately.
4. Prepare Agentverse registration and actual ASI:One acceptance: real image attachment ingestion, confirmed properties, processing/status and usable authenticated result delivery. Johaan will provide the stable HTTPS endpoint after Vultr deployment. Do not advertise registration or chat-only completion until demonstrated. Do not expose the team API token in returned links/chat.
5. Commit and push. Return SHA, changed files, commands, tests, actual live evidence, blockers and what Johaan's computer needs next.

Integration review follow-ups: Johaan fixed repeat submission of the same selected photos after a successful upload and added a DOM regression test; merge that fix before continuing. Before exposing ACP publicly with real provider credentials, enforce sender authorization or an approved bounded quota/spending policy: signature validity alone does not grant permission to spend the backend's Meshy credits. Test a valid but unapproved sender. Also label every standalone UI mock validation field as simulated; it currently mixes simulated passes with a disclaimer that checks did not run. The live-backend synthetic path actually runs MuJoCo and is separately verified.

## Srijan — send with the source-photo ZIP

Continue on `codex/asset-preparation`, preserving current work. Fetch and merge the pushed `origin/codex/backend-pipeline` when clean. See `docs/handoffs/charger-geometry-correction.md`.

The broad slab is the iPad/case beneath the charger. Rotation alone cannot repair it. Johaan's private transfer archive is `outputs/geometry-review/charger-source-photos.zip`; the archive itself must be transferred, since a path on another laptop is not accessible.

1. Inspect the archive and prepare documented charger-only crops/masks, preserving originals. If available views cannot isolate/reconstruct the body, request clearer views including the USB-C side and pins.
2. Send Johaan the actual prepared images and preprocessing note. Johaan owns the next Meshy request; avoid duplicate paid jobs.
3. After receiving the replacement raw mesh, establish that the support is absent and the charger body/pins are plausible before scaling. Document the explicit rigid rotation and physical dimension-to-axis mapping.
4. Keep dimensions and mass estimated unless measured. Inspect nonuniform scale factors for hidden distortion. Commit/push findings and necessary preparation changes with tests and handoff.

## Johaan — integration and deployment

Verify the merged frontend against the real HTTP API with mock reconstruction and actual preparation/MuJoCo validation; this does not establish real-object fidelity. Publish a verified feature-branch commit and handoff. Continue Vultr after the operator signs in: verify credits and server cost, establish access/HTTPS, run authenticated mock acceptance and persistence checks, then enable the real provider without an extra paid reconstruction. Never publish environment files or provider keys.

## Yash — work available before replacement geometry

After Johaan publishes the integration commit, fetch and merge `origin/codex/backend-pipeline` into your clean simulation branch, preserving camera/LeRobot work. Read `frontend/HANDOFF.md` for startup. Use a new `PHOTO2SIM_DATA_DIR`, set `PHOTO2SIM_PROVIDER=mock` explicitly, and enter a private local `PHOTO2SIM_API_TOKEN` through the frontend's API access field. Set frontend `VITE_API_MODE=live` and `VITE_API_BASE_URL=http://127.0.0.1:8000` in ignored `.env.local`.

Run a fresh browser upload → estimated properties → process → validation → authenticated ZIP download. Extract that browser-downloaded ZIP elsewhere and run the existing Windows validator and native viewer on its `scene.xml`. Confirm synthetic labeling, dimensions, successful download and relocation. Report exact integration SHA, runtime versions, validation and native-viewer evidence. No real reconstruction or motor commands are needed.

Final real-object acceptance must wait for a replacement bundle. Johaan must supply its actual ZIP, source/preview reference, axis/dimension note and validation report. Then recheck appearance, collision, portability and unchanged numerical limits on Windows and record the final demonstration. The old charger bundle stays a labeled pipeline smoke test.
