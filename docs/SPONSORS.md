# Sponsor and regular award targets

Updated 2026-10-24 after Johaan's shortlist change and review of the official
event listing, Figma challenge document, CREAO hacker pack and supplied Hive
screenshots. Corrected the requested code-review tool to Greptile and assessed
Bitdeer AI using its official Cal Hacks starter pack and the event listing.
These are targets, not completed integrations or eligibility claims.
Vultr is removed from the active shortlist; historical deployment notes remain.

**Confirmed scope:** finish core acceptance, complete **Gemini, Figma and
GoDaddy Registry**, then consider Apify. All other sponsor/tool additions are
parked. See the [main-chat scope handoff](handoffs/confirmed-demo-and-sponsor-scope.md).

## Sponsor tracks

| Target | Practical fit and current position | Remaining evidence |
| --- | --- | --- |
| Google Gemini — Best Use of Gemini API | Highest priority: existing image/property suggestions and explicit human review are central to this workflow. | Accept the combined reliability fixes and demonstrate suggestions, provenance, manual correction and unavailable-service behavior. |
| Figma — Best Figma Workflow Hack | Add: useful for a focused review-screen iteration and explaining the real build process. No product pivot is required by the linked rules. | Genuine Figma Make/prototype work, required Figma Slides, stage log, accessible files, working-code link and demo; see below. |
| GoDaddy Registry — Best Domain Name | Add: small branding/discoverability task, separate from the simulation implementation. | Obtain a qualifying domain through the event's Registry offer, confirm eligible suffix/registration terms and retain the domain/project link. Registration and eligibility are not yet established. |

The fit/effort judgments above are our engineering assessment. Official prize
existence alone does not establish that our current project qualifies.

### Figma submission details

The official Devpost listing links to **Cal Hacks <> Figma**, titled **Idea To
Demo**. It explicitly permits the project teams were already building. Show the
actual Figma contribution; do not reconstruct a fictional earlier design process.

- A demo video of at most three minutes.
- A workflow/stage log, at most 200 words per stage, covering ideation,
  prototyping, handoff and code generation. State tools, reasons, time spent,
  effectiveness and how the output reached the final project; be honest about
  stages that did not use Figma.
- Required Figma Slides with the stage log, demo, embedded Make/prototype files
  and working repository link. Files must be accessible to anyone; the document
  also asks participants to be Edu verified.

Prizes differ between Devpost and the linked detailed Figma document. Srijan
should confirm categories/amounts and the final submission route with Figma.

### Investigated, not selected for implementation

Apify is for later consideration only. All other entries below are parked by
Johaan's confirmed scope decision; retained research is not an active assignment.

| Candidate | Useful Kamino application | Recommendation |
| --- | --- | --- |
| Apify — Best Use / Best Actor | An Actor retrieves published dimensions/material references for a user-selected object and retains URL, product variant, units and retrieval provenance for review. This directly addresses unsupported property guesses. | Best optional addition after acceptance. A source match must remain a hypothesis, and body dimensions cannot silently size a full mesh containing pins. An existing Actor may support Best Use; Best Actor requires building an Actor for the event. Meaningful use must be demonstrated. |
| Bitdeer AI — Best Use of Bitdeer AI Model Studio | Its official Cal Hacks starter pack offers text/image chat models, embeddings, reranking and image generation. A multimodal model could supply a separately labeled second opinion on object/material suggestions; retrieval models could help rank sourced specification references if that feature exists. | Parked. A second model agreeing does not verify physical properties. No Bitdeer calls have been tested here. |
| Greptile — code-review tool | Could review integration diffs across sizing, history, API contracts and Gemini failure handling. Official docs support repository-aware PR review and local branch review. | Parked. No Greptile prize was found in the checked official event listing. |
| Fetch.ai | Could orchestrate the primary workflow through ASI:One. | Parked. Existing implementation/research is preserved; do not complete public integration under the current scope. |
| Convex — Best use of Convex | Live shared job status, review decisions and team annotations while Python retains simulation processing. | Useful later, but introduces another source of state and integration work now. Official description expects real features such as live queries/components. Do not migrate the existing SQLite/artifact system just for eligibility. |
| CREAO AI — Best AI-First Disruptor / Best Team Empowerment / Best One-Person Company | A core agent could coordinate evidence gathering, request missing measurements and hand a reviewed result to simulation. | Defer. The official hacker pack requires at least one CREAO agent doing core work, an agent ID and shared run link in the README, and the agent running in the demo. A peripheral chatbot is insufficient. Team Empowerment is conceptually closer than One-Person Company, but neither is a current qualification claim. |
| Spacetime — Best Use of Spacetime | A genuinely shared simulation review with synchronized pose, playback and review state across users. | Strong future collaboration fit, high effort now. Supplied Hive guidance calls for meaningful core real-time use. Adding a cosmetic live counter or duplicate database would not satisfy the intended role. |

Bitdeer's official event prize details describe Model Studio credits and hardware
prizes, despite Devpost's cash-style total heading; do not advertise a cash award
from that heading. The starter pack provides a credit-request form. Access,
credits, integration and qualification remain unverified for Kamino.

Working priority: finish the core demo, complete Gemini, Figma and GoDaddy
Registry, then consider Apify. Bitdeer, Fetch, Greptile, Convex, CREAO and
Spacetime are parked. Replit is not a requested target.

### Archived Fetch submission checklist — inactive

- [ ] Register at least one agent on Agentverse and make it discoverable through ASI:One.
- [ ] Implement Agent Chat Protocol and meaningful tool execution.
- [ ] Demonstrate the complete primary workflow inside an ASI:One conversation.
- [ ] Publish a public repository with run/test instructions and required agent details/tags.
- [ ] Include the required demo video.
- [ ] Submit through Devpost and the CalHacks ASI:One submission agent.

Fetch's published prize amounts have differed from Devpost. Confirm payouts with the sponsor rather than advertising an unverified amount.

Meshy is the selected reconstruction provider, not one of our selected sponsor tracks. Meshy API access/credits are separate from sponsor benefits. Never assume another sponsor's credits cover Meshy usage.

## Regular awards

- Cal Hacks Overall awards: a complete workflow with a clear robotics-lab use case; claim time savings only after measuring them.
- Cal Hacks Most Technically Complex Hack: geometry processing, collision representation, property provenance, and reproducible simulation validation.
- Cal Hacks Most Creative Hack: a compelling real-object-to-simulation experience.

## Official references

- [Cal Hacks prize list and event requirements](https://cal-hacks-13-0.devpost.com/)
- [Fetch CalHacks challenge and submission requirements](https://www.fetch.ai/events/hackathons/calhacks-13-0/hackpack)
- [Figma challenge and submission requirements](https://docs.google.com/document/d/1HjzThDGveSLiilIdEPEHq12ZVLZ5eS0T8CQC5_m_-rg/edit?tab=t.0)
- [CREAO CalHacks 2026 hacker pack](https://community.creao.ai/CalHacks2026)
- [MLH prizes and GoDaddy Registry offer entry](https://www.mlh.com/events/prizes)
- [Apify Actors](https://docs.apify.com/actors)
- [Convex realtime](https://docs.convex.dev/realtime)
- [Spacetime official Cal Hacks announcement](https://spacetimedb.com/blog/spacetime-at-calhacks)
- [Spacetime architecture](https://spacetimedb.com/docs/intro/what-is-spacetimedb/)
- [Greptile overview](https://www.greptile.com/docs/introduction)
- [Greptile local code-review CLI](https://www.greptile.com/cli)
- [Bitdeer AI official Cal Hacks starter pack](https://www.bitdeer.ai/en/blog/bitdeer-ai-starter-pack-for-cal-hacks-13-0/)
- [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Event resource portal](https://hive.hackberkeley.org/resources)
- [Meshy multi-image API](https://docs.meshy.ai/en/api/multi-image-to-3d)
