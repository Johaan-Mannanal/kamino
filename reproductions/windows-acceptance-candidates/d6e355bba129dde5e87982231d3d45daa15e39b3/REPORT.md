# Windows candidate acceptance — d6e355b

Tested application: **`d6e355bba129dde5e87982231d3d45daa15e39b3`**, October 25, 2026, America/Los_Angeles. New isolated checkout: `C:/Users/srija/calhacks-arm/outputs/d6`. The delivery manifest's 25 payloads verified. The candidate checkout remained clean; no application source edits, deployment, real Gemini/Meshy calls, or provider credentials were used.

**Focused acceptance passed in the scopes below. This is not a new full-checklist or release approval.** The original a834763 result (20 PASS / 8 BLOCKED), its manual addendum, and its combined 24 PASS / 4 BLOCKED position remain unchanged and belong to the original SHA. The original native backend failures are not waived; the full backend suite was not rerun on this candidate.

| Check | Result and executed scope | Main evidence |
| --- | --- | --- |
| Saved caption | PASS: server preview says unsaved; successful explicit Save changes caption to saved sizing. Scale/viewer identity and newer-edit races also covered by regressions. | `ui/caption-preview.*`, `ui/caption-saved.*`, frontend report |
| O04 | PASS: actual pinned F3 bad saved state/attempt imported into a separate labeled job. Processing rejected with 409 before review and after unreviewed correction. Browser exposes legacy sizing warning and orientation/target/reference gates; old attempt remains in history. | `api-review/summary.json`, `ui-o04/summary.json` |
| P05 | PASS in supplied replay scope: positive, unknown, malformed, truncated, quota and overload use the real parser/error adapter. Viewing responses changes no saved inputs; error cases retain cache byte-identically and allow manual entry. Browser quota replay retains unsaved mass/friction. | API scenario snapshots; `ui/P05-drafts-retained.txt` |
| R03 | PASS: both preparation and validation one-shot failures on real copied can jobs, retained failed inputs/attempts, then genuine same-process retries/export/validation. Browser validation failure displays labeled non-physics diagnostics; explicit Retry completes with both attempts preserved. | `api-review/REPORT.md`, `ui/R03-failure.*`, `ui/R03-retried.*` |
| R04 | PASS: real UI upload of the three fixture photos fails through the mock worker with provider_failed. Back to photos retains all three; explicit fresh Create recovers to ordinary synthetic mock geometry. Saved photos match the can fixture byte-for-byte. API failure/recovery independently passes. | `R04-browser-summary.json`, `ui/R04-provider-failed.*`, `ui/R04-photos-retained.txt`, `ui/R04-recovered.*` |
| Inherited request/apply/save | PASS in observed scope: cached estimates load without applying; selected Apply changes drafts only; explicit Save persists reviewed inputs; target changes clear acknowledgements/reference confirmation and gate generation. | `ui-properties/REPORT.md` |
| S02 / O01 | PASS in visual/orientation scope: human-operated, agent-inspected distinct top/front/side/underside views of one isolated can. Lid/tab/rim, body and recessed base retained; length follows blue +Z with lid above base. | Corrected native PNGs; `visual-review.md` |
| Z03 | PASS in numerical/native smoke scope: native Reset time0/zero contacts, Run produces four contacts, stable rest, then Pause. Fresh persisted sequence shows contact at1.474s and paused rest at8.558s. | `ui/native-reset-time0-corrected.png`, `ui/native-running-contact-corrected.png`, `ui/native-final-rest-corrected.png` |
| D03 | PASS: actual native Chrome Reload dialog, Cancel retains Surface2+3/140mm/0.31kg/0.4 drafts. Second actual Reload confirmation navigates to the memory-only token gate; token reentry restores saved Surface3/131mm/0.30kg/null, Saved, completed revision5 and two attempts. Full job JSON before/after is equal. | `ui/D03-native-*`, `D03-state-comparison.json` |

The R04 recovery cube proves provider-error handling and persistence only; it is not acceptance of can reconstruction quality. P05's non-quota variants were checked through integrated API replay, not individually repeated in the browser. The UI cache seed had a different model identity from the quota launcher, so explicit Request legitimately made a synthetic quota request while retaining visible estimates; same-model POST cache reuse is not claimed from that UI observation.

## Automated verification

- Native Windows affected backend suite: **111 passed**, one existing TestClient deprecation warning (`backend-focused-native.log`).
- Workspace: **119 passed**; legacy frontend: **103 passed**; both TypeScript checks and production builds passed. Existing large-bundle warnings remain (`frontend-review/REPORT.md`).
- Initial sandbox test setup failed to create default temp directories; a writable-temp sandbox run then hung in TestClient. Those logs were retained, the verified hung candidate child stopped, and the successful native run used candidate-owned temp files. Initial copied dependency resolution failures were retained and resolved before successful frontend runs.

## Artifacts and identities

Main browser job: `7f021e56-94b6-43f9-bc35-ef226a5b0a7a`, completed input revision5. Failed attempt `86399f82-c381-4497-9fc3-45ba119ec974`; successful UI retry `82b57713-9e34-4e3e-a87f-d4d92c42e0d6`.

- Browser-produced `browser-retry.zip`: SHA-256 **`bbf9172e1b497ac7f48bec9292076b05a96f8edda6129ac1de516e3d96e93bc0`**, 1,436,533 bytes. Fresh relocation passed ZIP CRC, safe member/XML references, MuJoCo3.17.0 loading and 30,000 steps/three simulated seconds, finite state and zero warnings (`browser-relocation.json`).
- Native visual/drop checks used the separately generated API validation-retry export `093be680596d23a8fa9d3c25e52949c189a8f92da62b1560699d1043de1f02ae`, relocated under `api-review/relocated-final-can`. It has the same saved target/orientation/sizing/dynamics and identical visual OBJ SHA `e1437620a734d028a9abd9fc9b0c99be5ea455e5bbacac3f50ac3ca4eeda66e7` as the UI export. These are distinct jobs/ZIPs, not one artifact.
- Historical F3 ZIP remains byte-identical: `53ab115fe9b364f14b6fc0ec3f309c73e2d009fef34c7e74480ca0f19425cf13`. Browser historical-download capture timed out; API serving established byte identity.
- Estimated full-Z reference131mm, equal axis scale0.07178149522642335, derived extents29.793682931 ×29.806611520 ×131mm; maximum exported extent error6.94e-18m against tolerance1e-7m. Mass0.30kg estimated; friction null, simulator default0.8 separately disclosed. Collision is a box proxy; inertia is approximate. Physical measurement/contact/grasp accuracy and watertightness remain unverified.

## Evidence correction and review

An independent reviewer caught stale native screenshot saves: a lexical variable retained the initial frame despite correct live camera observations. The invalid provisional files are retained under `capture-errors/` and are excluded from manual PASS evidence. The human repeated all four angles, saving fresh state explicitly; raw JPEG captures and properly encoded PNGs are retained. Corrected screenshots have different hashes and passed independent visual review (`visual-review.md`, `visual-review-hashes.json`). Dark underside lighting and soft/uneven reconstructed rim remain visible limitations. RGB world-axis overlays are not mesh distractors. The corrected upright axis/rest image shows blue parallel to the body; the literal Frame=World menu setting was observed live during the first setup.

Claude Code review completed after explicit approval to send only the pinned changed-code diff to Claude. No tools/MCP or application-provider calls were used. No acceptance-blocking defect was confirmed after full-code triage. Mount-exception scroll cleanup and extra generic importer consistency assertions are maintenance observations (`claude-review/triage-approved.md`). Earlier blocked attempts remain documented. Claude review is supplemental, not runtime acceptance.

The R04 subagent's Chrome timeouts were superseded by the parent's completed IAB upload/failure/recovery check. A stale O04 leave-site dialog was found in native Chrome and canceled. An initial parent file selection used nonexistent paths and submitted no upload; selections were cleared and replaced with verified existing fixture files before the successful R04 sequence. Programmatic refresh/keyboard adapter behavior is not substituted for the actual native D03 dialog clicks.

## Preservation and isolation

All **12,086** baseline original/addendum files verified byte-identical: zero changed, missing or read errors (`preservation-after.json`). Original application checkout remains clean at `a834763920176f34cafd07a49aa5ea9064bdc545`; candidate remains clean at the exact requested SHA. Original archives, published reports and branches were not rewritten or pushed.

The supplied acceptance launcher constructed empty real-provider credentials, in-process Gemini fixtures, mock reconstruction and a loopback-only socket guard. No denied-external ledger exists; this is application isolation evidence, not OS-wide packet capture. The intentional Claude review is separate from application-provider calls. Candidate services on8003/5189/IPv6 localhost5173 were stopped after ownership verification to seal logs. Original services were untouched; the candidate native viewer remains paused. New data is under `outputs/d6/outputs/ui-integration/browser`; no .env was copied or loaded.

Deployment, hosted/container acceptance, a complete new-SHA backend/checklist rerun, and physical/hardware/grasp acceptance remain outside this focused result.
