# Sponsor scope and evidence

Current publication: October 25, 2026. This page supersedes the old Fetch/Vultr
shortlist and earlier Bright Data/Apify feasibility plans. It records product use
and submission preparation, not an award, confirmed eligibility or submitted opt-in.

| Target | Implemented use | Evidence still needed |
| --- | --- | --- |
| Google Gemini / MLH — Best Use of Gemini API | Backend photo-based property suggestions; uncertainty/notes; bounded retries, configurable fallback and cached provenance; editable UI drafts | A concise demo of actual assistance and its limits |
| Figma — Best Figma Workflow Hack | Atul's Figma design/prototype informed Home, Upload, Creating mesh and Workspace implementation | Anyone-accessible artifact, exports, authentic stage log and required Figma Slides; see [evidence checklist](FIGMA_EVIDENCE.md) |
| GoDaddy Registry / MLH — Best Domain Name | `kamino.design` registered through the event offer at Porkbun; HTTPS site hosted on Railway | Include the live domain in the submission; keep registration/billing records private |
| Microsoft — Built for the Real World (including second-place Customer Impact Award) | Candidate productivity use case: preparing editable simulator assets from real-object inputs | Clarification that this human-reviewed AI workflow meets the sponsor's agent requirement; see [assessment](handoffs/microsoft-real-world-track-assessment.md) |

The [official prize directory](https://hive.hackberkeley.org/prizes) and
[event Devpost](https://cal-hacks-13-0.devpost.com/) are the rule sources, checked
October 25. Opt-in selection and final submission are separate actions; this
repository does not certify that either has been completed.

## General award targets

The confirmed general pursuits are Cal Hacks Overall (first/second/third overall),
Most Technically Complex Hack and Most Creative Hack. The team must verify its
actual Devpost opt-in selections separately; this list is the intended scope.

## Gemini implementation

The adapter lives in [gemini.py](../src/photo2sim/integrations/gemini.py); the
[Workspace](../prototypes/kamino-ui/src/live-workspace.ts) presents estimates,
notes and deliberate application/save behavior. Configured model names are in
[the environment template](../.env.example); availability depends on the provider
and account. No web-search grounding or verified product-specification lookup is
claimed. New-job friction has a labeled estimated fallback, with automatic
replacement only while that default remains untouched.

## Excluded claims

Bright Data and Apify are removed from the implementation plan. Fetch.ai and
Vultr are historical exploration, not current integrations. Railway hosts the
app; Porkbun is the domain registrar. Microsoft/Azure services are not used as
part of the released runtime. A Figma file link alone does not establish a complete
Figma prize submission, and synthetic screenshots do not prove use of Figma Make.

Describe delivered functionality, human review and known reconstruction limits.
Do not claim measured speedups, customer adoption, physical calibration or
simulation-to-hardware transfer without corresponding evidence.
