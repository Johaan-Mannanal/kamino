# Message to Master: focused mobile review of frozen a834763

Master,

Completed a focused mobile browser check of frozen candidate `a834763920176f34cafd07a49aa5ea9064bdc545` from `codex/combined-release-20261025`. Tested the candidate's `prototypes/kamino-ui` application, not Atul's newer `frontend/src/kamino` implementation. Target-review v2 and your automatic-polling correction were present.

The check used an isolated managed checkout on `codex/mobile-a834763-review`. Application source stayed byte-identical to a834763 throughout inspection. This branch's subsequent commit contains this report only; its SHA is in the delivery metadata. No fixes, cumulative 724867c patch, shared-candidate changes, deployment, broad test rerun, real provider request or paid reconstruction occurred. Previous UI branches and packages remain separate.

## Device, viewport and runtime details

No connected-phone tooling was available (`adb` was not installed; browser controls exposed the desktop in-app browser). This was viewport emulation in the ChatGPT in-app browser on Windows 11, not a real iPhone/Android or a mobile-browser certification.

| Viewport in CSS pixels | Coverage |
| --- | --- |
| 320 x 568 portrait | Home, initial/completed Workspace, narrow forms and clipping |
| 390 x 844 portrait | Full focused workflow: upload/token, target selection/orbit, invalidation, save, generate, warnings, history, download, error and reload |
| 430 x 932 portrait | Home, initial/completed Workspace and form layout |
| 844 x 390 landscape | Completed Workspace layout and scrolling geometry |

Observed DPR was approximately 1. The pointer remained desktop/fine (`pointer: coarse` false). Mouse/keyboard actions verified operability, not finger hit accuracy. Browser engine version and a mobile user agent were not exposed by these controls. Native on-screen keyboard, pinch/multitouch, safe areas, browser-chrome resizing, real-device performance, Safari/iOS zoom behavior and TalkBack/VoiceOver were NOT RUN.

Windows runtime: Windows 11 build 22631; Python 3.12.4, FastAPI 0.162.0, httpx 0.28.1, Pydantic 2.14.1, NumPy 2.5.4, trimesh 5.2.0, MuJoCo 3.17.0, Node 24.22.1. Existing ignored node_modules junctions supplied the pinned frontend libraries, including Vite 7.3.7 and Three.js 0.180.0. This was not a fresh dependency-install acceptance run.

The UI ran on loopback port 5193 with a test-only same-origin proxy to port 8008. The backend used the exact candidate create_app with explicit mock settings, empty Gemini/Meshy keys, a local test authentication token and outbound network blocking. No `.env` was loaded. A harness-only MockProvider generated three disconnected boxes; two were explicitly selected and the broad slab excluded. A non-private gray-square PNG was uploaded through the actual UI. This fixture does not claim photo reconstruction or physical target correctness.

## What worked

- Home, Upload and the HTML token dialog fitted the tested portrait layouts. Upload selection, thumbnail and Create mesh were operable; Creating mesh showed queued server status before opening Workspace. Its brief queued state was observed in the accessibility snapshot, not separately photographed.
- No document-level horizontal overflow was measured in these screens. This does NOT mean all controls fitted: M01 records clipped descendants hidden by the viewport.
- Both 3D views rendered. The target view showed blue selected surfaces and grey excluded surfaces. Mouse drag orbited it without moving the page. Surfaces 1 and 2 were selected explicitly; no surface was automatically chosen. The source-photo dialog fitted at 390 px.
- Manual orientation/reference/mass forms were editable. The diagnostic reference was 100 mm full Z with an explicit estimated description, saved X rotation 90 degrees, mass initially 0.12 kg and friction unknown. Server-derived extents were 185 x 200 x 100 mm with uniform scale 0.1. These are fixture consequences, not measured dimensions.
- Changing surface selection cleared target acknowledgement and reference acknowledgement, preserved length 100 and mass 0.12, and blocked Generate. Restoring the exact previously saved selection restored its saved review state; saving an unchanged target was correctly disabled.
- An orientation draft blocked generation. Saving X=90 invalidated the previous source-bound target/reference; numeric drafts remained. Reviewing the target and reference again restored save eligibility.
- The candidate has separate **Save reviewed properties** and **Generate simulation** actions. Both worked. This is not a test of Atul's newer combined **Save & generate** action.
- Attempt A completed after explicit save/generate. The first ZIP was downloaded through the actual browser UI and hashed. Changing mass to 0.13, saving and generating B produced two completed attempts with passing original/relocated numerical reports. ZIP CRC checks passed.
- Retained Bundle/Report/Scene XML/Inputs controls were visible in expanded history. A remained byte-identical when retrieved over authenticated HTTP after B. During a new unsaved target edit, both history bundle controls and the current completed bundle remained available while new generation was blocked.
- A reload required re-entry of the test token (expected in-memory auth behavior) and restored the saved target, orientation, reference, mass and two attempts. The deliberately unsaved target edit did not persist across reload.
- Explicit Gemini Request with empty provider configuration returned sanitized `not_configured`/HTTP 503 and manual-entry guidance. The 0.13 kg manual draft survived and could still be saved. No provider transport was invoked. In this candidate, saved-suggestion GET on entry did not automatically become a generation POST on a missing cache.
- The retained server log shows ordinary metadata polls followed by one geometry inventory fetch at completion for each tested attempt, consistent with your polling correction; no repeated geometry fetch occurred between those processing polls. This is focused observed evidence, not a replacement for your polling/race regression tests.

## Findings

Priorities below are proposed review priorities, not release decisions. No fixes are included.

### M01 - P1: portrait viewer toolbar controls are clipped

At 390 px the `.viewer-actions` group ended at x=458.1, outside the screen. Fullscreen ended at x=393.4 and Retry files at x=458.1. At 320 px, Download mesh ended at x=355.3 and was also clipped; fullscreen/retry were farther offscreen. At 430 px, Retry files still exceeded the available width. The page had no horizontal scrollbar because the viewport clips its descendants. A document scrollWidth-only test therefore misses this functional access issue.

Evidence: `07-workspace-initial-390.png`, `08-workspace-initial-320.png`, `09-workspace-initial-430.png`, `25-completed-top-320.png`, plus exact rectangles in `browser-measurements.json`.

Suggested scope: wrap/reflow the toolbar or reduce mobile labels while keeping fullscreen, mesh download and file recovery reachable. Do not alter target semantics to repair presentation.

### M02 - P2: small target-selection rows and dense controls

Surface checkboxes measured 13 x 13 px and their clickable label rows only 19 px high. Target save and Generate buttons were 34 px high; selects were 36 px high. Numeric inputs used 14 px text, selects 12 px and the reference acknowledgement 11 px. The field labels provide larger focus areas than the inner inputs, so this is not a claim that every input has only a 20 px touch target. Actual finger accuracy was not tested.

Forms fitted and could be edited, but the surface rows and dense review text merit enlargement on phones. These measurements are a usability finding, not a formal WCAG result. Evidence: `10-target-selection-390.png`, `12-reference-form-390.png`, `26-form-320.png`, and `workflow-checks.json` touch measurements.

### M03 - P2: long scrolling separates comparison, save and generation

Initial portrait Workspace height was 3,115 px at 390 and 3,237 px at 320. Expanded history plus Gemini error/review state reached roughly 3,700-3,900 px. The main viewer scrolls out of view while editing. After saving near y=2,358 the primary Generate action remains at the top; it is not adjacent to the saved form or persistently visible.

The target instruction says to compare photos in the "left column", but on phones the source-photo panel is moved near the bottom, far from target review. The photo dialog itself works. This is comparison/navigation friction, not missing data. Evidence includes `15-saved-form-390.png`, `19-attempt-history-390.png`, `21-two-attempts-390.png`, `23-source-photo-dialog-390.png` and the source/target positions in `workflow-checks.json`.

Atul's fixed-viewer/inspector-scroll changes may address some of this, but have not been integrated here. Recheck that the all-surface target preview, source-photo access and output history remain reachable after any scrolling redesign.

### M04 - P2: Saved status does not include unsaved target/reference state

After completing B, uncheck Surface 2. Target status correctly says review has unsaved changes, reference acknowledgement is cleared and Generate is disabled. However the header and form footer still say **Saved**. The viewer simultaneously says **Selected target - review unsaved**.

The generation gate is functioning; this is a misleading status defect, not an observed export bypass. Evidence: `29-unsaved-target-saved-header-390.png` and `workflow-checks.json` (`dirtyHeader`, `dirtyTargetAfterB`). The screenshot was re-captured with normal framing; an earlier wheel gesture had zoomed the canvas and was not treated as a renderer defect.

### M05 - P3: preview remains labelled unsaved immediately after property save

After Save reviewed properties, header=Saved and Generate becomes enabled, while the viewer label remains **Reviewed target - Server sizing preview - unsaved**. After processing completes it becomes saved sizing. The transient inconsistency is recorded in `workflow-checks.json` under `savedLabel`.

Recheck this when combining the newer Save & generate flow with source-bound target sizing. A valid preview and an unsaved form should not be conflated in status copy.

### M06 - P2: detailed geometry/export notes are not shown inline

The general shape/scale warning and numerical validation scope are visible and wrap. The fixture's six `asset.notes` are not rendered in the Workspace, including the explicit box-collision approximation and geometry-only/no-texture-fidelity notes. They remain in downloadable artifacts; `renderOutputs` displays report scope/error rather than these asset notes.

This is a cross-layout presentation gap, not a mobile-only backend data-loss claim. Preserve or expose the detailed notes during the UI integration. Evidence: asset notes in `api-results.json`, visible scope in `21-two-attempts-390.png`, and candidate `live-workspace.ts` output rendering.

### M07 - P3: processing-state gate explanation is misleading

While the button says Generating and the server is preparing, the gate explanation says **Save reviewed properties for the current orientation before generating**. Inputs had already been saved and generation had started. The process worked, but the reason should describe active processing rather than imply a missing save. Evidence: `16-processing-390.png` and its status entries in `browser-measurements.json`.

## Evidence identities and limits

Synthetic job: `5b48f4ae-1250-43d7-b770-46c6dda6bb13`.

| Attempt | Input revision | Mass | ZIP SHA-256 |
| --- | --- | --- | --- |
| A `b00f53c5-6248-4fed-9474-3a9839e6d337` | 5 | 0.12 kg | `092f1249d2d5169becf766ff64c62bbcd546f59337ffb090d72dfb64a50093ad` |
| B `fde7f67f-a864-472e-ba63-ac003c12fb74` | 6 | 0.13 kg | `bed858a69c5e0aabaea76121d1094a4b1f74cdd262063464060fb45cdfa97f9c` |

A's native browser download was checked. B and the retained A were retrieved over authenticated HTTP; B was not claimed as a second native-browser download. Both reports passed the stated upright box-proxy scope, and both have `viewer_inspected=false`. No physical can/charger/grasp or native MuJoCo GUI acceptance is implied.

The file chooser and native download automation took unusually long to return (several minutes); those harness delays were not used as application transfer/performance measurements. Canvas mouse wheel zoom is expected and is not a page-scroll performance result.

There are 29 viewport screenshots plus DOM measurements, workflow snapshots, API result/hash checks, source/runtime record and sanitized access logs in the handoff package. Screen dimensions are CSS px; ordinary desktop scrollbars reduced the content widths by about 15 px. The absence of a blocked-network ledger means no denied external attempt was recorded; it is paired with explicit empty provider keys and mock-provider settings. No private photos or provider credentials are in the package.

No unit/full suite, broad backend acceptance, fresh dependency install, deployment/container build, hosted-site mutation, live Gemini compatibility call or original-can/charger reconstruction was run. Source/hash replacement races and actual iOS/Android touch/keyboard behavior remain NOT RUN. Synthetic integrated failures were limited to the existing no-key Gemini response; arbitrary provider/quota/validation failure injection was not added.

## Recheck after the newer UI delta is integrated

1. Automatic Gemini: cache-first behavior, once-per-job attempt rules, no render/poll request loops, manual drafts on failure, and no re-enable of target/reference gates from optional suggestions.
2. Save & generate: retain target-review v2, saved orientation/context binding, explicit full-extent acknowledgement, current metadata/revalidation gates, stale-result rejection and newer-draft preservation. This candidate's separate buttons passing does not accept the new combined action.
3. Invalidation: selection/source/orientation changes must clear reference acknowledgement while retaining numeric drafts; header/footer dirty labels must include target state. Retained exports must remain downloadable even while a new target is invalid.
4. Polling: preserve master's completion/mesh-change-only geometry revalidation; explicit Refresh still needs its stronger semantics. Avoid remounting/reloading geometry on every process poll.
5. Responsive layout: recheck all four widths, toolbar access, source-photo comparison, both viewer surfaces, status/errors, notes, history and downloads. A document-width assertion alone will not catch clipped controls.
6. Real device: finger selection/scroll escape from canvases, native numeric keyboard, focus/zoom, safe areas, rotation and actual download/share behavior still need a real phone.

Please review these findings against the frozen source and identify the combined delta before accepting a mobile fix. This report does not authorize deployment or ask to apply the cumulative 724867c patch. Master delivery uses the existing manual handoff channel; no recipient chat/address for a direct binary transfer is available on this host.
