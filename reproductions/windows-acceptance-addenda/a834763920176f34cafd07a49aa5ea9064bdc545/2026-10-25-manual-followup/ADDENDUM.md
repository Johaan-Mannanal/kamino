# Manual Windows acceptance addendum — October 25, 2026

Johaan — the requested manual follow-up is complete on the **same clean application build `a834763920176f34cafd07a49aa5ea9064bdc545`**. **S02, O01, Z03 and D03 PASS** in this dated addendum. The original run, reports, exports, manifest, evidence archive and published results commit remain unchanged.

The original record remains **20 PASS / 8 BLOCKED**. Combined with these four closures, the current checklist position is **24 PASS / 4 BLOCKED**. This is not release acceptance: O04/P05/R03/R04, the original native backend-suite failures and other candidate gates remain open. Master owns the stale caption and missing replay capabilities before the next candidate. Physical/grasp accuracy remains unverified.

## Identity and preservation

- Original results commit: `63afa513f1a56a2a8e5122a00571e7ae42e5fc14`, branch `codex/windows-acceptance-a834763-20261025`.
- This addendum publishes separately on `codex/windows-acceptance-addendum-20261025`; no original path is replaced.
- Application checkout stayed clean at the tested full SHA. The backend was restarted using the same pinned offline helper/data only to redirect ongoing access logs into this new addendum folder. Explicit empty provider keys, MockProvider, forbidden Gemini transport and loopback socket guard remained in place. No application changes, provider requests, property/selection/orientation saves or new export generations occurred.
- Job `c25fcbbd-cec8-4065-ab36-d829fd9be888` is still completed at **revision 17**, final attempt **`b55c6230-e25c-434d-9015-abb9c72ed189`**, with the same four attempt records. The complete saved API JSON before and after is equal (`state-comparison.json`). Access logs contain zero POST/PATCH/PUT/DELETE requests for this follow-up.
- `preservation-before.json` / `preservation-after.json` verify 14 original/published files byte-identically, including the original evidence ZIP, record, summary, manifest, final B/report, fixture archive and published copies.
- Original evidence ZIP SHA-256: `987d8c00cd6784f33a18629f0beba78a582ef0c9347063fe8b4e0f74898ebc7b`.
- Unchanged final B ZIP SHA-256: `f8d4d57bc924940eef6f8ba06316797b754d7c7369d854b3926252b628ad53cf`. Visual OBJ SHA-256: `e1437620a734d028a9abd9fc9b0c99be5ea455e5bbacac3f50ac3ca4eeda66e7`.

## Completed manual observations

| Check | Addendum result | Actual evidence and observation |
| --- | --- | --- |
| S02 | PASS | Actual human camera drags produced distinct front, side, top and underside views in the native MuJoCo viewer. `ui/Z03-front.png`, `Z03-side.png`, `Z03-top.png`, `Z03-underside.png`, `Z03-underside-close.png` show one continuous can body, retained lid/rim and recessed base, without visible distractors or crop amputation. Front/side lighting, rim silhouette and shadow directions differ. Original source-selection captures distinguish kept Surface 3 from the other three excluded surfaces; unchanged selected-output mesh identity links that review to these final-output angles. |
| O01 | PASS | `ui/O01-native-world-Z.png` shows the can length along the blue world +Z axis, lid above base. Saved/exported orientation remains X=90°, Y=Z=0° (`geometry-audit.json`). Front, side, top and underside were inspected. Rendering → Frame → World was a temporary viewer display option; the colored axes are overlays, not reconstructed distractors, and no scene/export file was saved. |
| Z03 | PASS | Installed MuJoCo **3.17.0** standard native viewer loaded the same final B `scene.xml` using only relocated bundle assets, from a directory outside checkout/backend data. Four real camera angles were inspected. Native Reset restored the original drop height; Run showed the fall to contact. Info showed four contacts at 6.298 s and stable upright rest through **9.997 s**, then Pause (`ui/Z03-reset-initial-drop.png`, `Z03-running-rest.png`, `Z03-native-time-contacts.png`, `Z03-native-stable-rest-9s.png`). No native stderr warning was recorded. Separate fresh relocated three-second smoke: finite state, zero warnings (`relocated-smoke.log`). Numerical physics, shape inspection and physical accuracy are separate. |
| D03 | PASS | Unsaved drafts included Surface 2+3 selection, reference 140 mm, mass .31 kg and friction .4, with generation blocked. Actual Chrome toolbar Reload showed the native “Changes you made may not be saved” prompt (`ui/D03-native-reload-prompt*.png`). Agent directly selected Cancel; selection/reference/dynamics drafts remained dirty and unchanged (`D03-cancel-retains-all-drafts.*`). Fresh drafts were then prepared again. Human explicitly continued through the native reload prompt; navigation reached the application token screen (`D03-human-confirmed-reload-token-screen.*`). Because this build keeps its local token in tab memory, reentry was required. After the same dummy token was reentered, actual browser DOM/screenshots showed **Saved**, Surface 3 only, X=90°, reference 131 mm, mass .30 kg, friction blank and four attempts (`D03-final-saved-restoration.*`). The full server job record remained equal to its baseline; no Save or process request occurred. |

## Human participation and tooling limits

The human operated native camera drags and the final deliberate Reload confirmation. The agent captured/reviewed the actual views, operated native Reset/Run/Pause/Info, prepared unsaved drafts, directly performed the first prompt/Cancel sequence, restored the local dummy token and checked invariants. Exact operator replies and attribution are in `operator-actions.json`. Two subagents independently reviewed requirements/visual evidence and preservation. Claude was not used: inference cannot replace manual UI evidence.

Earlier automated drags did not change the camera reliably, and browser control twice ended when its URL safety check could not establish the current page. Those failed attempts are not counted as view/confirmation coverage. The final closures rely on actual human camera movement and the final human-confirmed continuation plus observed navigation/restoration. After the human initially described the reload as not finishing, actual browser DOM showed the token gate; entering the tab-local test token completed restoration. A stale native UIA tree still described the previous dirty document during this transition; it is retained in `ui/D03-after-human-confirmation.native-extract.txt` as a tooling anomaly and is **not** used as restored-state evidence. The final browser DOM, screenshots and unchanged local API are authoritative here. No automated confirmation click is invented.

## Geometry and validation limits

The single estimated 131 mm full-Z reference still uses equal scale factors **0.07178149522642335**. Derived/exported extents remain **29.793682931 × 29.806611520 × 131 mm**; maximum audited full-extent error is `6.94e-18 m` against `1e-7 m` tolerance. The ~29.8 mm diameter disagrees with the historical estimated 57 mm; it was not independently stretched. Mass remains estimated 0.30 kg and friction remains null. Appearance is geometry-only, collision is a box proxy and inertia is a cuboid approximation.

The rim is slightly uneven/soft as reconstructed. The dark underside close view supports visible base/rim continuity, not watertight topology or fine-detail fidelity. Existing packaged validation reports were not edited, including their `viewer_inspected=false` fields; this dated addendum is the separate record of actual GUI inspection.

Original native backend results remain **365 passed, 25 failed, 7 skipped**; the separate short-temp diagnostic passed those 25 cases without waiving the original result. Frontend 103/99 and build results remain supporting evidence from the original pass. No unrelated retest, application fix or changing candidate was introduced.

## Delivery

This addendum's evidence ZIP contains only new follow-up evidence, its own manifest/checksum, scripts and preservation records. The original 52 MB archive is referenced by immutable hash and is not duplicated or rebuilt. Paths above are relative to the extracted addendum ZIP. Use the original results branch for its original source-selection/automated-test/fixture evidence.

Please keep both records immutable. The four requested manual gaps are now closed on a834763. Remaining replay/candidate work and the stale caption belong to Master before the next build; they are not silently marked PASS here.
