# Atul / Kamino Workspace target-review interface

Ownership acknowledged by Atul via Johaan: this chat owns `target-review.ts`, its
tests and the small rigid-workflow hook. Atul owns the Figma layout, including Home,
Upload and Creating mesh. This is the interface to preserve in the Workspace; its
implementation is in progress on `codex/rigid-target-review`.

## Branding baseline

Use the reconciled checkpoint `724867cea2497a571002e6d0d9ac46d64b604c6f`, branch
`codex/kamino-sizing-gemini-checkpoint`, as the authoritative branded sizing/Gemini
baseline. Full validation: 378 Python passed / 2 optional skips, 86 frontend passed,
build and Ruff passed. The shared mixed checkout was not committed or pushed.

Do not blindly apply another branding commit on top. Atul's `fa8db862...` has been
reported but is not yet fetchable from origin, so no claim of byte-for-byte
comparison with it is made. Preserve any distinct UI work; compare the text delta
when its commit is available. A branding/docs-only delta from exact d4107843 to
this checkpoint is retained at
`outputs/checkpoint-acceptance/checkpoint-branding-and-docs.patch`, with checksum.
It passes `git apply --check` on d4107843. It includes the five latest reconciled
master docs; use this only on that baseline, not blindly on a redesigned branch.
Python imports/distribution `photo2sim`, `PHOTO2SIM_*`, API routes and saved format
identifiers stay unchanged. Do not rewrite historical exports.

## Module exports (frozen integration contract)

`frontend/src/target-review.ts` exports these types and functions:

```ts
export type TargetDraft = {
  selectedIslandIds: string[]
  reviewNote: string
  acknowledged: boolean
}
export type TargetReviewState = {
  inventory: TargetInventory | null
  loading: boolean
  error: string | null
  draft: TargetDraft
}
export function initialTargetDraft(job: Job, inventory: TargetInventory): TargetDraft
export function targetReviewStatus(job: Job, state: TargetReviewState): {
  status: 'loading' | 'error' | 'unreviewed' | 'unsaved' | 'stale' | 'reviewed'
  referenceReady: boolean
  canProcess: boolean
  reason: string
}
export function targetReviewControls(job: Job, state: TargetReviewState): string
export function readTargetDraft(host: HTMLElement): TargetDraft
export function targetReviewRequest(job: Job, state: TargetReviewState): TargetReviewRequest
export function mountTargetGeometry(
  host: HTMLElement, inventory: TargetInventory,
  orientation: Orientation, selectedIslandIds: string[],
): () => void
```

`targetReviewControls` returns escaped accessible HTML controls, not a page shell.
The caller owns layout/CSS and event binding. `mountTargetGeometry` mounts the
local orbit preview and returns cleanup; dispose before replacing its host. It
shows all islands, distinguishes selected/excluded geometry, and performs no
automatic part choice. Multiple islands are valid. Default new selection is empty;
only a saved review matching the current source may restore a prior selection.

`TargetInventory` contains `source_mesh_sha256`, `algorithm`, and `islands[]` with
`id`, `label`, `node_index`, `face_count`, `vertex_count`, `bounds_input_units`.
A preview request also contains `geometry[id] = { vertices, faces }` in raw input
units with existing node transforms baked. Never treat them as physical metres.
IDs are source-bound topology identifiers, not semantic product identification.

## API hook

Additions to the existing authenticated `Api` client:

```ts
geometry(id: string, preview?: boolean): Promise<TargetInventory>
reviewGeometry(id: string, request: TargetReviewRequest): Promise<Job>
```

- `GET /api/jobs/{id}/geometry?preview=true`: read-only current inventory/preview.
- `PATCH /api/jobs/{id}/geometry-review`: request fields are
  `source_mesh_sha256`, `island_ids`, `orientation` (saved orientation),
  `review_note`, `acknowledge_geometry: true`, `expected_input_revision`.
- Success returns the updated Job, with `geometry_review` containing those inputs,
  `algorithm`, `geometry_context_sha256`, `reviewed_at`, and
  `state: user_reviewed_not_physically_verified`.
- Properties gain optional `geometry_context_sha256`. Explicit save after target
  review binds reference sizing to that context. `sizing-preview` accepts this
  context and returns it with derived dimensions. Do not copy an old context onto
  a new selection automatically.

All calls use the existing bearer-header handling. No credentials in URLs, new
Meshy requests or CAD uploads. Manual mass/friction drafts and Gemini suggestions
remain separate and must survive target-review errors.

## Saved versus unsaved and invalidation

- A checkbox/draft change is local only. Disable generation while selected IDs,
  acknowledgement or note differ from the saved review. Merely highlighting parts
  is not a saved review or an input revision.
- Explicit review POST/PATCH binds the current source/selection/saved orientation,
  increments the input revision and preserves prior attempts/downloads. Replace the
  saved Job from its response; do not overwrite newer local drafts after a late reply.
- Source, selected IDs or saved orientation changes make prior context stale.
  Clear cached sizing preview and `reference_full_extent` acknowledgement, retain
  numeric drafts for review, and require a new preview/save. Do not guess a new
  dimension or transfer a body-only reference to a whole-scene extent.
- A new review with changed geometry clears the persisted properties' context.
  This yields a reviewed target but `referenceReady=false` until reference sizing
  is explicitly rebound/saved.
- A refresh/source reload revalidates inventory hash. Clear selection when the
  source changed; never assume the largest island is the target.
- Async results must be tied to job ID/source hash/input revision; discard late
  responses after navigation, refresh or newer edits.

## Workspace display / blocking

Display target status separately from reference sizing and numerical checks:

- loading/error/unreviewed/unsaved/stale: show the reason and keep Generate/Regenerate
  disabled; retain source and prior ZIP downloads.
- reviewed with `referenceReady=false`: show “Target reviewed; review and save its
  reference correspondence.” Keep generation disabled.
- reviewed with `referenceReady=true`: target gate permits processing; the host
  must also require a valid stage, no pending property/orientation drafts and no
  active request. Backend rechecks source/selection/orientation/binding before claim.

Every newly generated attempt, including regeneration of a historical completed
job, requires the review. Old completed exports remain accessible without it.
“Reviewed” means user-reviewed target geometry, **not** verified shape, physical
measurement or successful real-world simulation. Numerical validation is its own
passed/failed outcome. A rejected/fused/unfaithful source remains unresolved; no
automatic selection, tiny-part removal or nonuniform repair is performed.
