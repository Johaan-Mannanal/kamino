# First real-object input: charger estimates

The user supplied four photos of an official Apple USB-C charger and explicitly requested estimated physical properties. The photos visually resemble a 20W model; the exact model is unconfirmed.

Shared property fixture: `examples/api/apple-20w-estimated-properties.json` (validated against `AssetProperties`). All physical values use **estimated** provenance, not measurements of this specimen.

- Full extents: **43 × 27 × 58 mm**, with z including pins.
- Mass: **59 g**.
- Sliding friction: unknown/null.

Reference: [ChargerLAB's first-hand review of the similar A2940 adapter](https://www.chargerlab.com/review-of-new-apple-20w-charger-for-iphone-15-a2940) reports body dimensions approximately 42.5 × 27 × 41.5 mm and mass 58.5 g. Our values are rounded and the overall height assumes an additional 16 mm pin extension. This pin allowance and model match are unverified. Do not apply these dimensions blindly before checking the prepared mesh's axis orientation.

The input photographs and original/local measurement record remain under ignored `data/captures/object-01/`. The API key stays in ignored local configuration. No photographs or secrets are included in this note/fixture.

## Upload evidence

Phone JPEGs were identified by Pillow as MPO because they carry multi-picture metadata. The backend rejected them locally before creating any provider task. The fix accepts the JPEG primary format without rewriting the original bytes; a synthetic MPO regression test demonstrated rejection before the fix and preservation afterward. Full suite: 45 tests passed; Python 3.12 CI for `68cb37d` passed.

API authentication/balance and task-list reads succeeded. The four-photo and reduced single-photo submissions timed out before returning task IDs. Subsequent task-list reads were empty and credit balance unchanged. A photo-sized, deliberately invalid request reproduced **HTTPX WriteTimeout** while sending the body; an empty invalid request promptly returned HTTP 400. No successful photo-to-mesh result has yet been established. Inspect provider tasks before any resubmission to avoid duplicates.
