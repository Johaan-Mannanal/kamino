# Public repository readiness

Reviewed October 25, 2026. The repository is already public. This checklist concerns
presenting and reproducing the delivered project, not changing the production app.

## Published

- Current application source on `main`, with successful exact-commit CI linked in
  [the release index](RELEASE.md).
- [README](../README.md) covering the product, architecture, local mock setup,
  live site, Devpost, real/synthetic distinctions and limitations.
- [Four confirmed sponsor pursuits and three general award targets](SPONSORS.md),
  separate from final opt-in or eligibility confirmation.
- [Microsoft eligibility assessment](handoffs/microsoft-real-world-track-assessment.md):
  the published-rule interpretation and unresolved agent-fit question are explicit;
  no Azure integration, sponsor approval or customer impact numbers are invented.
- Known display issues and verification boundaries recorded without overwriting
  historical acceptance evidence.
- Upstream SO-101 asset license and attribution retained under `third_party`.

## Still needed from the team

1. **Accessible Figma evidence.** Atul should supply an Anyone-viewable design or
   prototype, genuine frame exports, the actual workflow stage log and Figma Slides.
   Follow [the evidence checklist](FIGMA_EVIDENCE.md); website screenshots alone
   are not Figma-process evidence.
2. **Presentation media.** Add a short, locally retained demo and selected public-safe
   product screenshots. Label synthetic inputs and scripted charger movement.
   Link the final video from the README and Devpost once available.
3. **Microsoft clarification and opt-in check.** Obtain a sponsor/organizer answer
   if available, and verify the actual Devpost selections for all intended tracks.
   A confirmed pursuit does not establish eligibility or submitted opt-in.
4. **Project license choice.** There is no root project license yet. The team must
   choose the intended reuse terms; third-party licenses remain independent.

## Publication hygiene

A scoped scan of the current tracked source and 16 tracked ZIP archives checked
credential/private-key patterns, known demo access-code literals and sensitive
archive filenames. No credential matches or sensitive archive filenames were
confirmed. Blank template assignments were distinguished from actual values.
This is not a full-history security audit and does not certify every remote branch.
Ignored local production backups, account records, credentials and user-job storage
must stay private. Never publish a whole `outputs` folder as a shortcut to sharing
screenshots or evidence.

Historical team notes and branches are retained for provenance. Use the README,
[project scope](PROJECT.md) and release index for current status rather than old
handoff “pending” statements. No branch deletion or history rewrite is part of this
publication pass.
