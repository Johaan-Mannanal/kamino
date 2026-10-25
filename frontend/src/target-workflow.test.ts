// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import type { Job } from './types'
const source = 'a'.repeat(64),
  one = 'b'.repeat(64),
  two = 'c'.repeat(64),
  context = 'd'.repeat(64)
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  document.body.innerHTML = ''
  vi.resetModules()
})
it('requires explicit target review then re-saved correspondence, and blocks unsaved selection', async () => {
  vi.resetModules()
  vi.stubEnv('VITE_API_MODE', 'live')
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:test'
      }
      static revokeObjectURL() {}
    },
  )
  vi.doMock('./viewer', () => ({ mountViewer: () => () => {} }))
  vi.doMock('./target-review', async () => ({
    ...(await vi.importActual<typeof import('./target-review')>('./target-review')),
    mountTargetGeometry: () => () => {},
  }))
  const record = {
    schema_version: '1.0',
    id: 'd415d0ce-07af-4eae-9a1d-cf81ebb227a0',
    status: 'awaiting_properties',
    provider: 'mock',
    synthetic: true,
    created_at: '',
    updated_at: '',
    progress: 100,
    source_images: [],
    provider_task_id: 'cached',
    mesh_path: 'mesh.glb',
    input_revision: 1,
    properties: {
      dimensions_m: { x: 0.04, y: 0.06, z: 0.1, source: 'estimated' },
      mass_kg: { value: 0.1, source: 'estimated' },
      sliding_friction: null,
      sizing: {
        mode: 'uniform',
        reviewed_orientation: { x_deg: 0, y_deg: 0, z_deg: 0 },
        reference: {
          axis: 'z',
          length: 100,
          unit: 'mm',
          source: 'user_supplied',
          correspondence: 'full_mesh_extent',
          description: 'Synthetic full extent',
        },
      },
    },
    geometry_review: null,
    asset: null,
    export_path: null,
    validation_path: null,
    bundle_path: null,
    error: null,
    orientation: { x_deg: 0, y_deg: 0, z_deg: 0 },
    attempts: [],
  } as Job
  const inventory = {
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
    geometry: {},
  }
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/geometry?')) return json(inventory)
    if (url.endsWith('/geometry-review')) {
      const body = JSON.parse(init!.body as string)
      record.geometry_review = {
        ...body,
        algorithm: inventory.algorithm,
        geometry_context_sha256: context,
        reviewed_at: '',
        state: 'user_reviewed_not_physically_verified',
      }
      record.input_revision!++
      record.properties!.geometry_context_sha256 = null
      return json(record)
    }
    if (url.endsWith('/sizing-preview'))
      return json({
        dimensions_m: record.properties!.dimensions_m,
        geometry_context_sha256: context,
        sizing_result: { scale_factors: [0.02, 0.02, 0.02], source_extents_input_units: [2, 3, 5] },
      })
    if (url.endsWith('/properties')) {
      record.properties = JSON.parse(init!.body as string)
      record.input_revision!++
      return json(record)
    }
    return json(record)
  })
  vi.stubGlobal('fetch', fetch)
  history.replaceState(null, '', `/?job=${record.id}`)
  document.body.innerHTML = '<div id="app"></div>'
  await import('./main')
  await vi.waitFor(() => expect(document.querySelectorAll('[data-target-island]')).toHaveLength(2))
  expect((document.querySelector('#process') as HTMLButtonElement).disabled).toBe(true)
  expect(document.querySelectorAll('[data-target-island]:checked')).toHaveLength(0)
  ;(document.querySelector('#target-select-all') as HTMLButtonElement).click()
  const note = document.querySelector('#target-review-note') as HTMLTextAreaElement
  note.value = 'Two parts form this synthetic object'
  note.dispatchEvent(new Event('input', { bubbles: true }))
  ;(document.querySelector('#target-review-ack') as HTMLInputElement).click()
  ;(document.querySelector('#save-target-review') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(record.geometry_review?.island_ids).toEqual([one, two]))
  await vi.waitFor(() =>
    expect(document.querySelector('#target-review-status')?.textContent).toContain(
      'reference correspondence',
    ),
  )
  expect((document.querySelector('#process') as HTMLButtonElement).disabled).toBe(true)
  ;(document.querySelector('[name="reference_full_extent"]') as HTMLInputElement).click()
  ;(document.querySelector('#save-properties') as HTMLButtonElement).click()
  await vi.waitFor(() => expect(record.properties?.geometry_context_sha256).toBe(context))
  await vi.waitFor(() =>
    expect((document.querySelector('#process') as HTMLButtonElement).disabled).toBe(false),
  )
  ;(document.querySelector('#process') as HTMLButtonElement).click()
  await vi.waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/process'))).toBe(true),
  )
  await vi.waitFor(() =>
    expect((document.querySelector('#process') as HTMLButtonElement).disabled).toBe(false),
  )
  ;(document.querySelector(`[data-target-island][value="${two}"]`) as HTMLInputElement).click()
  expect((document.querySelector('#process') as HTMLButtonElement).disabled).toBe(true)
  expect(
    (document.querySelector('[name="reference_full_extent"]') as HTMLInputElement).checked,
  ).toBe(false)
  expect((document.querySelector('[name="mass"]') as HTMLInputElement).value).toBe('100')

  // Reopen after an out-of-band source replacement: old reference ack must not carry over.
  inventory.source_mesh_sha256 = 'e'.repeat(64)
  vi.resetModules()
  document.body.innerHTML = '<div id="app"></div>'
  await import('./main')
  await vi.waitFor(() =>
    expect(document.querySelector('#target-review-status')?.textContent).toContain(
      'Source or orientation changed',
    ),
  )
  expect(
    (document.querySelector('[name="reference_full_extent"]') as HTMLInputElement).checked,
  ).toBe(false)
})

it('retains a newer review-note draft while the initial geometry request is pending', async () => {
  vi.resetModules()
  vi.stubEnv('VITE_API_MODE', 'live')
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:test'
      }
      static revokeObjectURL() {}
    },
  )
  vi.doMock('./viewer', () => ({ mountViewer: () => () => {} }))
  vi.doMock('./target-review', async () => ({
    ...(await vi.importActual<typeof import('./target-review')>('./target-review')),
    mountTargetGeometry: () => () => {},
  }))
  const id = 'd415d0ce-07af-4eae-9a1d-cf81ebb227a0'
  const record = {
    id,
    status: 'awaiting_properties',
    provider: 'mock',
    synthetic: true,
    source_images: [],
    mesh_path: 'mesh.glb',
    properties: null,
    geometry_review: null as Job['geometry_review'],
    orientation: { x_deg: 0, y_deg: 0, z_deg: 0 },
    validation_path: null,
    attempts: [],
  }
  let finish!: (response: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.includes('/geometry?')
        ? new Promise<Response>((resolve) => {
            finish = resolve
          })
        : json(record),
    ),
  )
  history.replaceState(null, '', `/?job=${id}`)
  document.body.innerHTML = '<div id="app"></div>'
  await import('./main')
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  const note = document.querySelector<HTMLTextAreaElement>('#target-review-note')!
  note.value = 'My newer local review draft'
  note.dispatchEvent(new Event('input', { bubbles: true }))
  const inventory = {
    source_mesh_sha256: source,
    algorithm: 'surface-islands-exact-seams-v1',
    islands: [
      {
        id: one,
        label: 'Surface 1',
        node_index: 0,
        face_count: 12,
        vertex_count: 8,
        bounds_input_units: [
          [0, 0, 0],
          [1, 1, 1],
        ],
      },
    ],
    geometry: {},
  }
  finish(json(inventory))
  await vi.waitFor(() => expect(document.querySelectorAll('[data-target-island]')).toHaveLength(1))
  expect(document.querySelector<HTMLTextAreaElement>('#target-review-note')!.value).toBe(
    'My newer local review draft',
  )
  expect(document.querySelectorAll('[data-target-island]:checked')).toHaveLength(0)
  // A metadata refresh during source revalidation must not replace this unsaved review.
  document.querySelector<HTMLInputElement>('[data-target-island]')!.click()
  record.geometry_review = {
    source_mesh_sha256: source,
    island_ids: [one],
    orientation: record.orientation,
    review_note: 'Review saved by another tab',
    acknowledge_geometry: true,
    algorithm: inventory.algorithm,
    geometry_context_sha256: context,
    reviewed_at: '',
    state: 'user_reviewed_not_physically_verified',
  } as Job['geometry_review']
  const initialFinish = finish
  document.querySelector<HTMLButtonElement>('#refresh')!.click()
  await vi.waitFor(() => expect(finish).not.toBe(initialFinish))
  finish(json(inventory))
  await vi.waitFor(() =>
    expect(document.querySelector('#target-review-status')?.textContent).toContain('unsaved'),
  )
  expect(document.querySelector<HTMLTextAreaElement>('#target-review-note')!.value).toBe(
    'My newer local review draft',
  )
  expect(document.querySelectorAll('[data-target-island]:checked')).toHaveLength(1)
})

it.each([
  'old-first',
  'fresh-first',
  'fresh-failure',
  'job-refresh-failure',
  'fresh-unchanged',
] as const)(
  'supersedes pending inventory on Refresh without accepting stale review (%s)',
  async (order) => {
    vi.resetModules()
    vi.stubEnv('VITE_API_MODE', 'live')
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL() {
          return 'blob:test'
        }
        static revokeObjectURL() {}
      },
    )
    vi.doMock('./viewer', () => ({ mountViewer: () => () => {} }))
    vi.doMock('./target-review', async () => ({
      ...(await vi.importActual<typeof import('./target-review')>('./target-review')),
      mountTargetGeometry: () => () => {},
    }))
    const orientation = { x_deg: 0, y_deg: 0, z_deg: 0 }
    const record = {
      id: 'd415d0ce-07af-4eae-9a1d-cf81ebb227a0',
      status: 'awaiting_properties',
      provider: 'mock',
      synthetic: true,
      source_images: [],
      mesh_path: 'mesh.glb',
      input_revision: 4,
      orientation,
      validation_path: null,
      attempts: [],
      properties: {
        dimensions_m: { x: 0.04, y: 0.06, z: 0.1, source: 'estimated' },
        mass_kg: { value: 0.1, source: 'estimated' },
        sliding_friction: null,
        geometry_context_sha256: context,
        sizing: {
          mode: 'uniform',
          reviewed_orientation: orientation,
          reference: {
            axis: 'z',
            length: 100,
            unit: 'mm',
            source: 'user_supplied',
            correspondence: 'full_mesh_extent',
            description: 'Synthetic full extent',
          },
        },
      },
      geometry_review: {
        source_mesh_sha256: source,
        island_ids: [one],
        orientation,
        review_note: 'Saved source review',
        acknowledge_geometry: true,
        algorithm: 'surface-islands-exact-seams-v1',
        geometry_context_sha256: context,
        reviewed_at: '',
        state: 'user_reviewed_not_physically_verified',
      },
    }
    const inventory = (changed: boolean) => ({
      source_mesh_sha256: changed ? 'e'.repeat(64) : source,
      algorithm: 'surface-islands-exact-seams-v1',
      islands: [
        {
          id: changed ? 'f'.repeat(64) : one,
          label: changed ? 'Fresh surface' : 'Old surface',
          node_index: 0,
          face_count: 12,
          vertex_count: 8,
          bounds_input_units: [
            [0, 0, 0],
            [1, 1, 1],
          ],
        },
      ],
      geometry: {},
    })
    const pending: ((response: Response) => void)[] = []
    let jobReads = 0
    let finishRefresh!: (response: Response) => void
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/geometry?'))
        return new Promise<Response>((resolve) => {
          pending.push(resolve)
        })
      if (url.endsWith(`/api/jobs/${record.id}`)) {
        jobReads++
        if (order === 'job-refresh-failure' && jobReads === 2)
          return new Promise<Response>((resolve) => {
            finishRefresh = resolve
          })
      }
      return json(record)
    })
    vi.stubGlobal('fetch', fetch)
    history.replaceState(null, '', `/?job=${record.id}`)
    document.body.innerHTML = '<div id="app"></div>'
    await import('./main')
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    const generate = () => document.querySelector<HTMLButtonElement>('#process')!
    const status = () => document.querySelector('#target-review-status')?.textContent
    const setMassDraft = () => {
      const mass = document.querySelector<HTMLInputElement>('[name="mass"]')!
      mass.value = '321'
      mass.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const expectDraft = () =>
      expect(document.querySelector<HTMLInputElement>('[name="mass"]')!.value).toBe('321')
    expect(generate().disabled).toBe(true)
    document.querySelector<HTMLButtonElement>('#refresh')!.click()
    await vi.waitFor(() => expect(jobReads).toBe(2))
    const oldResponse = json(inventory(false))
    if (order === 'job-refresh-failure') {
      // The old response must be invalidated even while Refresh's job GET is pending.
      pending[0](oldResponse)
      await vi.waitFor(() => expect(oldResponse.bodyUsed).toBe(true))
      expect(generate().disabled).toBe(true)
      expect(document.querySelectorAll('[data-target-island]')).toHaveLength(0)
      setMassDraft()
      finishRefresh(
        new Response(JSON.stringify({ detail: 'Job refresh unavailable' }), { status: 503 }),
      )
      await vi.waitFor(() => expect(document.body.textContent).toContain('Job refresh unavailable'))
      expect(generate().disabled).toBe(true)
      expectDraft()
      document.querySelector<HTMLButtonElement>('#refresh')!.click()
      await vi.waitFor(() => expect(pending).toHaveLength(3))
      const abandonedRefresh = json(inventory(false))
      pending[1](abandonedRefresh)
      await vi.waitFor(() => expect(abandonedRefresh.bodyUsed).toBe(true))
      expect(generate().disabled).toBe(true)
      expect(document.querySelectorAll('[data-target-island]')).toHaveLength(0)
    } else {
      await vi.waitFor(() => expect(pending).toHaveLength(2))
      if (order === 'old-first') {
        pending[0](oldResponse)
        await vi.waitFor(() => expect(oldResponse.bodyUsed).toBe(true))
        expect(generate().disabled).toBe(true)
        expect(document.querySelectorAll('[data-target-island]')).toHaveLength(0)
      }
      if (order !== 'fresh-unchanged') setMassDraft()
    }
    const latest = pending[order === 'job-refresh-failure' ? 2 : 1]
    if (order === 'fresh-failure') {
      latest(
        new Response(JSON.stringify({ detail: 'Geometry revalidation unavailable' }), {
          status: 503,
        }),
      )
      await vi.waitFor(() => expect(status()).toContain('Geometry revalidation unavailable'))
    } else if (order === 'fresh-unchanged') {
      latest(json(inventory(false)))
      await vi.waitFor(() => expect(status()).toContain('Target reviewed by you'))
      expect(generate().disabled).toBe(false)
      setMassDraft()
    } else {
      latest(json(inventory(true)))
      await vi.waitFor(() => expect(status()).toContain('Source or orientation changed'))
      expect(document.querySelector('[data-target-island]')?.getAttribute('value')).toBe(
        'f'.repeat(64),
      )
      expect(
        document.querySelector<HTMLInputElement>('[name="reference_full_extent"]')!.checked,
      ).toBe(false)
    }
    if (order === 'fresh-first' || order === 'fresh-failure' || order === 'fresh-unchanged') {
      pending[0](oldResponse)
      await vi.waitFor(() => expect(oldResponse.bodyUsed).toBe(true))
    }
    expect(status()).toContain(
      order === 'fresh-failure'
        ? 'Geometry revalidation unavailable'
        : order === 'fresh-unchanged'
          ? 'Target reviewed by you'
          : 'Source or orientation changed',
    )
    expect(generate().disabled).toBe(true)
    expectDraft()
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/process'))).toBe(false)
  },
)
