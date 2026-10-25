# Workspace refinement candidate

Isolated branch: `codex/workspace-refinements`. Base: `a834763920176f34cafd07a49aa5ea9064bdc545`. This candidate does not replace Srijan's frozen version and has not been pushed or deployed.

## Source and scope

Reviewed Atul's implementation `90b1437f264612d7ddb99a4d53ff971fd8d72248`, report `692cba4314be063594f53eac149d1fdd31e9ce91`, and package SHA-256 `ce5cef00503a06c7d4f9434838ed7ca2c90eae9cf615edbc457a07e4d0b1b4d2`. All 13 manifest entries verified. Ported behavior into the existing `prototypes/kamino-ui` architecture; neither cumulative nor incremental patch was applied wholesale.

- Cached-first estimates move above the form. A missing cache can trigger one automatic, non-refresh request. Authentication/server cache errors never trigger it. Generation and request sequence guards reject old responses, including reopening the same job and superseding a cache read with a manual request.
- Browser session storage plus an in-memory guard limit automatic attempts. This is not distributed exactly-once execution; separate tabs/devices, cleared storage or unavailable persistent storage can allow another attempt. Explicit retries remain possible. Backend fallback/cache policy is unchanged.
- Estimates never apply or save themselves. Existing selected-field application, explicit axis choice, unknown handling, notes/questions and actual-model provenance remain. A reference estimate clears correspondence acknowledgement.
- Save & generate uses the current geometry-bound preview/save/process methods. Save failure, intervening numeric/target edits or reopening aborts subsequent processing. Dirty retries say **Save & retry**. Separate Save remains available.
- The preview stays visible while the inspector scrolls. Target review, source photos, properties, warnings and prior downloads remain reachable. Home scrolling is restored on disposal. This ports the layout behavior, not Atul's older HTML/session implementation.
- Target-review v2, reference invalidation, historical downloads, assembly/replay/mapping code and the distinction between automatic status polling and explicit geometry refresh are retained.

No Python/backend, legacy frontend, dependencies, export format or deployment configuration changed.

## Verification

- Fresh isolated baseline: 99 Workspace tests.
- Final Workspace suite: **118 passed**; preserved legacy frontend: **103 passed**. Both TypeScript checks and production builds passed. Formatting and diff checks passed. Existing large Three.js bundle warnings remain.
- New regressions cover cached reuse, automatic request deduplication, auth/server errors, same-job stale reads, newer manual results, save/process ordering, failed saves, edits/reopen during saves, dirty retry wording, target invalidation and initial estimates after processing.
- Production-build browser review used the pinned original-can archive through the offline acceptance helper. Selected Surface 3, saved X=90 degrees, and explicitly used an estimated 100 mm full-Z diagnostic reference. This is not physical dimensional acceptance.
- Browser Save & generate produced A; correction to an estimated 0.30 kg produced B. Both completed and downloaded. Earlier A was fetched again through the backend and remained byte-identical. Saved target/orientation/reference survived reopening.
- An unconfigured Gemini response preserved manual entry. A subsequently seeded synthetic cache loaded without changing saved inputs. Applying only mass was explicit; synthetic dimensions were not used as the can reference.
- Both browser ZIPs loaded after extraction outside the checkout and ran the standalone MuJoCo 3.3.7 smoke check for three simulated seconds, finite with zero warnings. This does not establish physical or contact fidelity.
- Desktop and mobile browser checks inspected fixed preview, scrollable controls/history and restored Home scrolling. The current hosted root, assembly and health returned 200; unauthorized job access remained 401; existing rigid/assembly ZIP hashes were unchanged. Hosted check made zero mutations.

Local evidence: `outputs/refinements-review/acceptance-summary.json`, `final-job.json`, `can-A.zip`, `can-B.zip`, screenshots, test/build logs and `hosted-preservation.json`. Job: `ad6be770-774e-415d-bfcc-ec1bd2bdb837`; attempts A `8a116f8e-546a-43d1-8937-73d8387433a7`, B `fe88d861-e70b-4ac2-b6d0-35f23be19929`.

## Limits and next acceptance

Windows and hosted acceptance of this candidate are not run. Full Python suite was not rerun because backend source is unchanged; actual local can processing exercised the existing backend. No Meshy/Gemini provider calls, new reconstruction, hardware work, DNS or live deployment changes occurred. The single automatic suggestions POST in local testing returned not-configured before inference; subsequent cache reuse was local.

Let Srijan finish the immutable a834763 run. A later candidate retest needs this branch's exact commit and a separate result record, focused on request timing, explicit saving, review gates, history and mobile layout. Do not relabel his existing run as acceptance of these changes.

Reproduce frontend checks with Node >=22.12 and pnpm 11.25.0 using the two frontend package scripts. The implementation leaves deployment packaging at the frozen baseline.
