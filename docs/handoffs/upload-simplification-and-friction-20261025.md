# Upload simplification and automatic friction — 2026-10-25

Supersedes the mandatory photo framing step in 5ef11ce/8520240. User requested a simpler workflow after inconsistent charger reconstruction results.

## Change

- Upload goes directly to Create mesh. Cropping is optional; removed the per-photo reviewed flag, required gate and crop acknowledgement checkbox.
- Keep original images, optional lossless crop/reset, orientation and uniform sizing, target selection, stale-response protection and immutable prior exports.
- New jobs start with friction 0.8, source estimated, explicitly noted as the existing simulator-default fallback with unknown contacting materials, not a measurement. A valid Gemini friction estimate automatically replaces an untouched new-job default. Other suggestions still require explicit Apply. Save commits the draft.
- Saved values (including explicit unknown), retained drafts, manual edits/clearing and stale/disposed workspaces are protected. No backend or reconstruction provider request changed.

## Validation

132 prototype frontend tests passed; TypeScript and production build passed. Six new automatic-friction regressions cover null, populated cached estimate, late manual clearing, saved unknown, provider failure, zero and remount retention. Existing stale response tests remain passing.

Browser acceptance at desktop and 390x844 emulation: direct original upload without review, optional crop, invalid bounds, cancel, original reset, error retention, mobile overflow and session-only demo persistence messaging passed. Three uploads went only to a local fixture receiver; direct original and full reset matched original file bytes. Crop remained 1560x2130 lossless PNG without stretching. Zero external provider calls.

Evidence: outputs/upload-simplification-20261025 in the primary checkout. Hosted staging/production checks and rollback identities are recorded there separately.

## Reconstruction finding and limits

Job aa45b618-393a-474e-8b95-d2e2aedaf152 has no saved properties or sizing and zero orientation. The supplied downloaded GLB equals the stored raw Meshy GLB byte-for-byte, SHA256 1f8c8044bf90a557d100a5cfa3367e5e79011cbfa992c30a81add28e6b345934. Raw extents are approximately 1.899735 x 0.338813 x 0.625849 provider units; longest/shortest is 5.607. Independent rendering shows the same elongated geometry. All four submitted images were original 2160x3840 JPEGs, not crop derivatives.

Gemini correctly recognizing a likely charger does not constrain Meshy's separately generated mesh. Cached Gemini friction is null. Cropped earlier reconstruction still contained invented underside features; the mandatory review gate was not justified as a geometry fix. Older export/physics tests did not establish visual reconstruction fidelity. Charger difficulty and provider variability remain plausible, not proven causes of the varying output. No provider-model regression is established and this frontend release does not claim to repair malformed mesh geometry.
