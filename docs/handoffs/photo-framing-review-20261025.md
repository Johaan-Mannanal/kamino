# Photo framing review and demo-state wording

Base: 398ed042a473b1ffeb725667423ba617f16bc3b1. Frontend-only change; backend, provider settings, accepted jobs and simulation playback are unchanged.

Real uploads now require explicit framing review of every photo. Users can drag a rectangle, edit whole-pixel bounds, or retain the full original. The dialog respects browser-decoded EXIF orientation. Crops use PNG with equal source/destination dimensions, without stretching or downsampling. Invalid bounds, failed encoding and PNGs over 10 MiB are rejected. Original File objects remain in the tab for reset/re-edit; they are not uploaded alongside crops or persisted across refresh. The UI says this explicitly. Only the confirmed files go to the existing upload API. Adding a new photo requires reviewing it; cancel preserves the prior reviewed choice. Editing is blocked during access checks and upload submission.

Capture guidance requests the whole object, protrusions, exclusion of distractors and coverage of important faces such as ports. It does not promise accurate geometry. The prior cropped-photo experiment improved visible shape but invented underside geometry; no additional paid reconstruction is part of this implementation acceptance.

The procedural demo now says “Applied for this session” and warns that refresh resets changes/exports. Server-job persistence and its Saved labels are unchanged. Automatic Gemini suggestions on server-job entry remain existing behavior; this change neither disables them nor treats those requests as read-only.

## Verification

- 126 prototype tests, including four new crop tests, passed. Tests were first run with the new module absent, then passed after implementation.
- 108 legacy frontend tests passed. Both TypeScript checks and production builds passed; existing bundle-size warnings remain.
- 32 demo browser checks passed, including generated download, earlier export byte preservation, GLB reimport and mobile layout.
- Separate Chromium checks covered review gating, EXIF orientation 6, invalid bounds, cancel/reset, re-editing from the original, pointer selection, 390-pixel layout, failed-upload retention and demo apply/reload wording. Two multipart requests went to a local failure fixture server; zero provider calls.
- The actual cropped multipart file was a 1560 x 2130 PNG. Full-photo reset submitted the original JPEG byte-for-byte. Browser/Pillow JPEG decoding differs slightly (mean channel difference below 1, maximum 8); do not claim cross-decoder pixel identity. No resizing was performed.
- Evidence: outputs/photo-review-20261025 in the primary checkout. Native phone/Safari acceptance is not claimed. No backend suite rerun: backend source is unchanged.

Atul: main.ts upload handling and demo labels, new photo-review.ts, and the appended crop styles overlap future UI work. Preserve the required review gate, original-file reset, exact crop upload and session-only demo wording when integrating mobile fixes.

Deployment identities and rollback are recorded in the evidence release report, independently of these source checks.
