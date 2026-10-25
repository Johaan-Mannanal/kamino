// @vitest-environment jsdom
import { expect, it } from 'vitest'
import type { Job } from './types'
import {
  initialTargetDraft,
  targetReviewStatus,
  targetReviewControls,
  readTargetDraft,
  targetReviewRequest,
  type TargetInventory,
  type TargetReviewState,
} from './target-review'
const source = 'a'.repeat(64),
  one = 'b'.repeat(64),
  two = 'c'.repeat(64),
  context = 'd'.repeat(64)
const inventory: TargetInventory = {
  source_mesh_sha256: source,
  algorithm: 'surface-islands-exact-seams-v1',
  islands: [one, two].map((id, i) => ({
    id,
    label: `Surface ${i + 1}`,
    node_index: 0,
    face_count: 12,
    vertex_count: 8,
    bounds_input_units: [
      [0, 0, 0],
      [1, 1, 1],
    ],
  })),
}
const job = (): Job =>
  ({
    id: 'job',
    input_revision: 3,
    mesh_path: 'mesh.glb',
    orientation: { x_deg: 0, y_deg: 0, z_deg: 0 },
    properties: { geometry_context_sha256: context },
    geometry_review: {
      source_mesh_sha256: source,
      island_ids: [one, two],
      orientation: { x_deg: 0, y_deg: 0, z_deg: 0 },
      review_note: 'Reviewed two legitimate parts',
      acknowledge_geometry: true,
      geometry_context_sha256: context,
      algorithm: 'surface-islands-exact-seams-v1',
      reviewed_at: '',
      state: 'user_reviewed_not_physically_verified',
    },
  }) as Job
const state = (j: Job): TargetReviewState => ({
  inventory,
  loading: false,
  error: null,
  draft: initialTargetDraft(j, inventory),
})
it('never selects new source islands automatically', () => {
  const j = { ...job(), geometry_review: null }
  expect(initialTargetDraft(j, inventory).selectedIslandIds).toEqual([])
  const host = document.createElement('div')
  host.innerHTML = targetReviewControls(j, state(j))
  expect(host.querySelectorAll('[data-target-island]:checked')).toHaveLength(0)
  expect(targetReviewStatus(j, state(j)).canProcess).toBe(false)
  expect(() => targetReviewRequest(j, state(j))).toThrow()
})
it('restores explicit multiple-island review and separates reference readiness', () => {
  const j = job(),
    s = state(j)
  expect(s.draft.selectedIslandIds).toEqual([one, two])
  expect(targetReviewStatus(j, s)).toMatchObject({
    status: 'reviewed',
    referenceReady: true,
    canProcess: true,
  })
  j.properties!.geometry_context_sha256 = null
  expect(targetReviewStatus(j, s)).toMatchObject({
    status: 'reviewed',
    referenceReady: false,
    canProcess: false,
  })
})
it('blocks unsaved choices, stale source and changed orientation', () => {
  const j = job(),
    s = state(j)
  s.draft.selectedIslandIds = [two]
  expect(targetReviewStatus(j, s)).toMatchObject({ status: 'unsaved', canProcess: false })
  s.inventory = { ...inventory, source_mesh_sha256: 'e'.repeat(64) }
  expect(targetReviewStatus(j, s)).toMatchObject({ status: 'stale', canProcess: false })
  expect(initialTargetDraft(j, s.inventory).selectedIslandIds).toEqual([])
  expect(
    targetReviewStatus({ ...j, orientation: { x_deg: 90, y_deg: 0, z_deg: 0 } }, state(j)).status,
  ).toBe('stale')
})
it('round-trips controls into a revision/source/orientation-bound request', () => {
  const j = job(),
    host = document.createElement('div')
  host.innerHTML = targetReviewControls(j, state(j))
  const draft = readTargetDraft(host)
  expect(draft).toEqual(state(j).draft)
  expect(targetReviewRequest(j, { ...state(j), draft })).toEqual({
    source_mesh_sha256: source,
    island_ids: [one, two],
    orientation: j.orientation,
    expected_input_revision: 3,
    review_note: 'Reviewed two legitimate parts',
    acknowledge_geometry: true,
  })
})
it('escapes notes and errors while preserving drafts', () => {
  const j = job(),
    s = state(j)
  s.error = '<img src=x onerror=alert(1)>'
  s.draft.reviewNote = '</textarea><script>bad()</script>'
  const host = document.createElement('div')
  host.innerHTML = targetReviewControls(j, s)
  expect(host.querySelector('script')).toBeNull()
  expect(host.querySelector('img')).toBeNull()
  expect(targetReviewStatus(j, s).status).toBe('error')
})
