# Bright Data: reference lookup proposal and feasibility review

Prepared 2026-10-24 at Johaan's request. **Now queued on the master to-do list**
for the narrow identifiable-product specification lookup described below.
Earlier feasibility discussion is retained for context; broader CAD/image
identification ideas are not the queued scope. No Bright Data API requests,
image uploads, account setup, provider configuration or product-code changes
were performed for this feature.

## Proposed idea

Latest user clarification: lookup is an optional route only for easily
identifiable objects with strong identity evidence. Most objects will continue
to use estimated dimensions or manual input. Do not require universal image
identification, CAD retrieval or successful online specification coverage.
Use an exact visible model/part identifier, a confirmed product URL or reviewed
variant evidence as the lookup gate; an unsupported model confidence percentage
alone is insufficient. Missing or ambiguous references return to the existing
estimate/manual path. This clarification narrows the proposed design; no product
implementation or provider request has occurred in this master chat.

Use Bright Data to find public product specifications and potentially CAD links
for an object being converted by Kamino. Gemini could help identify candidate
products and interpret retrieved information. Users would review the product
match and dimension-to-mesh correspondence before adopting a sizing reference.

Examples raised: retailer dimensions from Amazon/Target and a screw's STEP/STP
model. These are proposed use cases, not verified retrieval results.

## Assessment

**Useful and feasible as reviewed specification lookup for identified products.
Not credible as universal photo-to-verified-dimensions/CAD in one API call.**

The API access is relatively straightforward. The hard parts are identifying the
exact variant, obtaining relevant fields, and deciding whether those fields
describe the object and mesh feature we intend to size. The same distinction
applies if retrieval is packaged behind a single endpoint.

## What the sources establish

- The official event listing includes **Best Agent/App Using Public Web Data
  sponsored by Bright Data**. Its prize details describe Bright Data credits
  and Amazon gift cards. This establishes a track, not our eligibility or a
  complete integration rubric. [Event listing](https://cal-hacks-13-0.devpost.com/).
- Bright Data's SERP API retrieves structured web-search results.
  [SERP documentation](https://docs.brightdata.com/products/serp-api/introduction).
- Its Google integration supports Lens searches using an image URL or a file
  upload. File upload has session-handling requirements and is not supported on
  async zones. The outputs are search matches, not certified product identity
  or physical measurements.
  [Google/Lens parameters](https://docs.brightdata.com/products/serp-api/query-parameters/google).
- Bright Data advertises Amazon and Target scrapers, and documents structured
  public-page extraction. The inspected product pages did not establish a
  guaranteed dimensions field for either retailer. Actual schemas, field
  coverage and selected-page output need checking.
  [Amazon](https://brightdata.com/products/web-scraper/amazon),
  [Target](https://brightdata.com/products/web-scraper/target),
  [scraper documentation](https://docs.brightdata.com/datasets/scraper-studio/faqs).
- The reviewed documentation does **not** establish a dedicated measurement
  database or an endpoint that identifies an arbitrary screw and supplies its
  correct STEP file. Searching for a CAD download link is plausible; obtaining
  and accepting the right model is a separate workflow.

## Correction to the Gemini premise

The local `src/photo2sim/integrations/gemini.py` inspected for this review sends
photos and an object hint to `generateContent`, requesting JSON estimates. Its
request does not configure Google Search grounding or a web-search tool, and its
contract explicitly labels suggestions unverified estimates.

Therefore, do not describe that inspected adapter as already looking up and
validating dimensions on the web. This is a working-source observation, not a
claim about every separate delivery or deployed service. Any different candidate
must be inspected independently.

Bright Data could add explicit external evidence; Gemini could still interpret
that evidence. This division is useful, but neither model interpretation nor a
successful scrape turns a published specification into a specimen measurement.

## Feasibility by scope

| Scope | Judgment | Main difficulty |
| --- | --- | --- |
| User supplies exact model number/product URL; retrieve one published dimension with citation | Good narrow prototype | Missing fields and dimension meaning |
| Photo suggests a few product candidates; user confirms one before lookup | Plausible extension | Similar variants, ambiguous views and extra interaction |
| Photo automatically identifies arbitrary objects and validates their dimensions | Unreliable hackathon promise | Identification, coverage and no physical scale ground truth |
| Exact known part number finds a public CAD download link | Plausible on selected sources | Availability, download flow, variant and units |
| Photo of an unspecified screw yields its exact STEP model | Poor near-term feasibility | Diameter, pitch, length, head standard and material may not be observable |
| Retrieved dimensions automatically calibrate arbitrary reconstructed geometry | Too broad | Feature/axis correspondence, reconstruction error and conflicting references |

Engineering estimate, not measured execution: allow roughly **4–8 focused hours**
for a narrow product-URL/model-number demo with existing access, reusable UI and
one or two known source formats. Account activation, unfamiliar schemas, image
matching or CAD ingestion can push it beyond a day. A quick successful HTTP call
is not evidence that the complete feature is almost done. Universal coverage is
an open-ended product effort; no honest completion estimate follows from API docs.

## Smallest useful version, if later approved

1. Accept a user-confirmed product URL/model ID. Keep image matching optional.
2. Retrieve a bounded number of relevant pages through Bright Data, preferring
   manufacturer/technical documentation when available.
3. Extract candidate references while retaining URL, retrieval time, quoted
   supporting text, product ID/variant, units and the dimension's stated meaning.
4. Show the evidence and conflicts for explicit review. Preserve missing values
   instead of inventing a reference or assigning an unsupported confidence score.
5. Let the user associate one supported full extent with the existing uniform
   sizing workflow, then regenerate using current input/history preservation.
6. Retain the evidence with the reviewed result. Web-sourced values stay sourced;
   they do not become measured merely because a user accepts the product match.

For a CAD candidate, first show its source and intended part identity. Automatic
download/import is a separate extension requiring file-format, units, orientation,
geometry and permitted-use review. Do not fold it into the first sizing-lookup
prototype or silently replace photo reconstruction with downloaded CAD.

## Failure cases that decide whether it is worth adding

- **Packaging versus product:** a listing's dimensions may describe its box.
- **Body versus full extent:** charger body length may exclude pins; screw
  length may use a head-dependent convention. Neither can be blindly assigned
  to an unrelated mesh bounding-box span.
- **Variant mismatch:** visually similar products can differ in size and revision.
- **CAD mismatch:** the file may be approximate, simplified, wrong-unit or a
  different part. Existence of a STEP file does not validate our specimen.
- **Source agreement:** duplicated retailer copy is not independent confirmation.
- **Unavailable data:** identifiers, specifications or downloads may be missing,
  restricted or inaccessible. Manual entry must remain usable.
- **Physics gap:** geometry references do not establish friction, inertia,
  compliance, servo mappings or accurate dynamics.

## Proposed evidence gate, not a task started here

If Johaan authorizes a spike, timebox its initial retrieval investigation before
committing to integration. Test a small declared set: identifiable known product,
similar wrong variant, package dimensions, conflicting values, no useful result,
and an exact known part with a CAD link if CAD remains relevant. Include objects
beyond the one chosen for the presentation.

Retain actual responses, field coverage, source correctness, latency/request
counts and operator review effort. Evaluate accepted references against a known
part identity and trusted published specification or independent measurement.
An inconclusive result must abstain. No accuracy percentage has been measured.

Proceed only if the narrow route yields traceable useful references, honestly
handles failures, and fits the remaining acceptance budget. A random successful
scrape or an API call that does not affect reviewed output is weak product and
sponsor evidence. Confirm detailed sponsor requirements separately.

## Relationship to the agreed scope

Core demo + Gemini + Figma + GoDaddy Registry remain the current pursuits.
Bright Data is now queued after core acceptance for the narrow specification
lookup, with implementation and sponsor acceptance still pending. Apify remains
parked; do not build a duplicate retrieval integration. Optional CAD uploads
remain in the final improvements phase, outside this feature.

Recommendation: keep this as a credible optional **sourced-reference assistant**.
Do not promise automatic physical validation or general CAD identification.
The useful version is narrower than the sponsor pitch, but it directly addresses
a real Kamino weakness.
