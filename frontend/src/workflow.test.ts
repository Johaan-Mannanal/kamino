// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Job, Suggestions } from './types'
const fixtureSource = 'a'.repeat(64),
  fixtureIsland = 'b'.repeat(64),
  fixtureContext = 'c'.repeat(64)
const geometryReview = {
  source_mesh_sha256: fixtureSource,
  island_ids: [fixtureIsland],
  orientation: { x_deg: 0, y_deg: 0, z_deg: 0 },
  review_note: 'Explicit synthetic fixture review',
  acknowledge_geometry: true,
  geometry_context_sha256: fixtureContext,
  algorithm: 'surface-islands-exact-seams-v1',
  reviewed_at: '',
  state: 'user_reviewed_not_physically_verified' as const,
}
const geometryInventory = {
  source_mesh_sha256: fixtureSource,
  algorithm: 'surface-islands-exact-seams-v1',
  islands: [
    {
      id: fixtureIsland,
      label: 'Synthetic fixture',
      node_index: 0,
      face_count: 12,
      vertex_count: 8,
      bounds_input_units: [
        [0, 0, 0],
        [1, 3, 2],
      ],
    },
  ],
  geometry: {},
}
const record: Job = {
  schema_version: '1.0',
  id: 'd415d0ce-07af-4eae-9a1d-cf81ebb227a0',
  status: 'awaiting_properties',
  provider: 'meshy',
  synthetic: false,
  created_at: '',
  updated_at: '',
  progress: 100,
  source_images: [],
  provider_task_id: null,
  mesh_path: 'mesh.glb',
  geometry_review: geometryReview,
  properties: {
    geometry_context_sha256: fixtureContext,
    dimensions_m: { x: 0.04, y: 0.05, z: 0.06, source: 'measured' },
    mass_kg: { value: 0.08, source: 'measured' },
    sliding_friction: null,
  },
  asset: null,
  export_path: null,
  validation_path: null,
  bundle_path: null,
  error: null,
  orientation: { x_deg: 0, y_deg: 0, z_deg: 0 },
}
const suggestion: Suggestions = {
  dimensions_m: { x: 0.042, y: 0.027, z: 0.058, source: 'estimated', note: 'Unverified' },
  mass_kg: null,
  sliding_friction: null,
  notes: ['Estimate only'],
  clarifying_questions: ['Include the pins?'],
}
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_API_MODE', 'live')
  vi.doMock('./viewer', () => ({ mountViewer: () => () => {} }))
  vi.doMock('./target-review', async () => ({
    ...(await vi.importActual<typeof import('./target-review')>('./target-review')),
    mountTargetGeometry: () => () => {},
  }))
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:test'
      }
      static revokeObjectURL() {}
    },
  )
  history.replaceState(null, '', `/?job=${record.id}`)
  document.body.innerHTML = '<div id="app"></div>'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  document.body.innerHTML = ''
})
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const reviewedSizing = (length: number) => ({
  mode: 'uniform',
  reviewed_orientation: record.orientation,
  reference: {
    axis: 'y',
    length,
    unit: 'mm',
    source: 'user_supplied',
    correspondence: 'full_mesh_extent',
    description: 'Synthetic full Y span',
  },
})
function installFetch(fetch: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
    url.includes('/geometry?') ? Promise.resolve(json(geometryInventory)) : fetch(url, init),
  )
}
async function start(fetch: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
    url.includes('/geometry?') ? Promise.resolve(json(geometryInventory)) : fetch(url, init),
  )
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('#process')).not.toBeNull())
  await vi.waitFor(() => expect(document.querySelector('[data-target-island]')).not.toBeNull())
}
function change(name: string, value: string) {
  const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`)!
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
it.each([false, true])(
  'invalidates completed or pending previews after refreshing another tab revision (pending=%s)',
  async (pending) => {
    let refreshed = false,
      finish!: (response: Response) => void
    const result = (scale: number) => ({
      dimensions_m: { x: scale, y: scale * 3, z: scale * 2, source: 'estimated' },
      sizing_result: {
        mode: 'uniform',
        scale_factors: [scale, scale, scale],
        source_extents_input_units: [1, 3, 2],
        resulting_dimensions_m: { x: scale, y: scale * 3, z: scale * 2, source: 'estimated' },
      },
    })
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/sizing-preview'))
        return pending
          ? new Promise<Response>((resolve) => {
              finish = resolve
            })
          : json(result(0.02))
      return json({
        ...record,
        input_revision: refreshed ? 2 : 1,
        properties: { ...record.properties, sizing: reviewedSizing(refreshed ? 90 : 60) },
        sizing_result: result(refreshed ? 0.03 : 0.02).sizing_result,
      })
    })
    await start(fetch)
    document.querySelector<HTMLButtonElement>('#preview-sizing')!.click()
    await vi.waitFor(() =>
      pending
        ? expect(finish).toBeTypeOf('function')
        : expect(document.querySelector('#sizing-preview')?.textContent).toContain('20.000'),
    )
    refreshed = true
    document.querySelector<HTMLButtonElement>('#refresh')!.click()
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>('[name="reference_length"]')!.value).toBe(
        '90',
      ),
    )
    if (pending) {
      finish(json(result(0.02)))
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain('Inputs changed during preview'),
      )
    }
    expect(document.querySelector('#sizing-preview')?.textContent).not.toContain('20.000')
  },
)
it('allows correction of a completed rigid job and keeps prior attempt download controls', async () => {
  const completed = {
    ...record,
    status: 'completed',
    bundle_path: 'attempts/old/simulation.zip',
    attempts: [
      {
        id: 'old',
        status: 'completed',
        inputs: {
          input_revision: 1,
          properties: record.properties,
          orientation: record.orientation,
        },
        inputs_path: 'attempts/old/inputs.json',
        export_path: null,
        validation_path: null,
        bundle_path: 'attempts/old/simulation.zip',
      },
    ],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json(completed)),
  )
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('#properties')).not.toBeNull())
  expect(document.querySelector<HTMLSelectElement>('[name="sizing_mode"]')?.value).toBe(
    'legacy_independent_axes',
  )
  expect(document.body.textContent).toContain('Prior processing attempts')
  expect(document.querySelector('[data-path="attempts/old/simulation.zip"]')).not.toBeNull()
})

it('previews explicit uniform sizing without inventing a reference length', async () => {
  const fresh = { ...record, properties: null }
  const fetch = vi.fn(async (url: string) =>
    url.endsWith('/sizing-preview')
      ? json({
          dimensions_m: { x: 0.02, y: 0.06, z: 0.04, source: 'estimated' },
          sizing_result: {
            mode: 'uniform',
            scale_factors: [0.02, 0.02, 0.02],
            source_extents_input_units: [1, 3, 2],
          },
        })
      : json(fresh),
  )
  installFetch(fetch)
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('[name="reference_length"]')).not.toBeNull())
  expect(document.querySelector<HTMLInputElement>('[name="reference_length"]')!.value).toBe('')
  await vi.waitFor(() =>
    expect(document.querySelector('#target-review-status')?.textContent).toContain('Target reviewed'),
  )
  change('reference_axis', 'y')
  change('reference_length', '60')
  change('reference_description', 'Full object including pins')
  const checkbox = document.querySelector<HTMLInputElement>('[name="reference_full_extent"]')!
  checkbox.checked = true
  checkbox.dispatchEvent(new Event('input', { bubbles: true }))
  document.querySelector<HTMLButtonElement>('#preview-sizing')!.click()
  await vi.waitFor(() =>
    expect(document.querySelector('#sizing-preview')?.textContent).toContain('20'),
  )
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/properties'))).toBe(false)
})
it('rejects an outstanding dimensions preview when the orientation draft changes', async () => {
  let finish!: (response: Response) => void
  const fetch = vi.fn(async (url: string) =>
    url.endsWith('/sizing-preview')
      ? new Promise<Response>((resolve) => {
          finish = resolve
        })
      : json({ ...record, properties: null }),
  )
  installFetch(fetch)
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('#preview-sizing')).not.toBeNull())
  await vi.waitFor(() =>
    expect(document.querySelector('#target-review-status')?.textContent).toContain('Target reviewed'),
  )
  change('reference_axis', 'y')
  change('reference_length', '60')
  change('reference_description', 'Full synthetic Y span')
  const check = document.querySelector<HTMLInputElement>('[name="reference_full_extent"]')!
  check.checked = true
  check.dispatchEvent(new Event('input', { bubbles: true }))
  document.querySelector<HTMLButtonElement>('#preview-sizing')!.click()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  change('x_deg', '90')
  finish(
    json({
      dimensions_m: { x: 0.02, y: 0.06, z: 0.04, source: 'estimated' },
      sizing_result: { scale_factors: [0.02, 0.02, 0.02], source_extents_input_units: [1, 3, 2] },
    }),
  )
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain('Inputs changed during preview'),
  )
  expect(document.querySelector('#sizing-preview')?.textContent).not.toContain('20.000')
})
it('keeps newer reference edits after save without displaying the old dimensions preview', async () => {
  let finish!: (response: Response) => void
  let saved: unknown
  const preview = {
    dimensions_m: { x: 0.02, y: 0.06, z: 0.04, source: 'estimated' },
    sizing_result: {
      mode: 'uniform',
      scale_factors: [0.02, 0.02, 0.02],
      source_extents_input_units: [1, 3, 2],
    },
  }
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/sizing-preview')) return json(preview)
    if (url.endsWith('/properties')) {
      saved = JSON.parse(init!.body as string)
      return new Promise<Response>((resolve) => {
        finish = resolve
      })
    }
    return json({ ...record, properties: null })
  })
  installFetch(fetch)
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('#properties')).not.toBeNull())
  await vi.waitFor(() =>
    expect(document.querySelector('#target-review-status')?.textContent).toContain('Target reviewed'),
  )
  change('reference_axis', 'y')
  change('reference_length', '60')
  change('reference_description', 'Full synthetic Y span')
  change('mass', '58')
  const check = document.querySelector<HTMLInputElement>('[name="reference_full_extent"]')!
  check.checked = true
  check.dispatchEvent(new Event('input', { bubbles: true }))
  document
    .querySelector('#properties')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  change('reference_length', '90')
  finish(json({ ...record, properties: saved, sizing_result: preview.sizing_result }))
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLButtonElement>('#save-properties')!.disabled).toBe(false),
  )
  expect(document.querySelector<HTMLInputElement>('[name="reference_length"]')!.value).toBe('90')
  expect(document.querySelector('#sizing-preview')?.textContent).not.toContain('20.000')
})
it('preserves failed orientation drafts and requires new target review after saving all angles', async () => {
  let fail = true
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/orientation'))
      return fail
        ? json({ detail: 'Try again' }, 503)
        : json({ ...record, orientation: JSON.parse(init!.body as string) })
    if (url.endsWith('/process')) return json({ ...record, status: 'preparing' })
    return json(record)
  })
  await start(fetch)
  change('x_deg', '90')
  document.querySelector<HTMLButtonElement>('#process')!.click()
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/process'))).toBe(false)
  document
    .querySelector<HTMLFormElement>('#orientation')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(document.body.textContent).toContain('HTTP 503'))
  expect(document.querySelector<HTMLInputElement>('[name="x_deg"]')!.value).toBe('90')
  fail = false
  document
    .querySelector<HTMLFormElement>('#orientation')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(document.body.textContent).toContain('Orientation saved'))
  document.querySelector<HTMLButtonElement>('#process')!.click()
  await vi.waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/process'))).toBe(false),
  )
  const orientationCall = fetch.mock.calls.find(([url]) => url.endsWith('/orientation'))!
  expect(JSON.parse(orientationCall[1]!.body as string)).toEqual({ x_deg: 90, y_deg: 0, z_deg: 0 })
})
it('loads saved estimates without modifying drafts; failed refresh keeps estimates and manual values; apply requires confirmation', async () => {
  const fetch = vi.fn(async (url: string, init?: RequestInit) =>
    url.endsWith('/suggestions')
      ? init?.method === 'POST'
        ? json({ detail: 'Provider unavailable' }, 503)
        : json(suggestion)
      : json(record),
  )
  await start(fetch)
  change('x', '43')
  document.querySelector<HTMLButtonElement>('#cached-suggestions')!.click()
  await vi.waitFor(() => expect(document.body.textContent).toContain('Include the pins?'))
  expect(document.querySelector<HTMLInputElement>('[name="x"]')!.value).toBe('43')
  document.querySelector<HTMLButtonElement>('#refresh-suggestions')!.click()
  await vi.waitFor(() => expect(document.body.textContent).toContain('HTTP 503'))
  expect(document.body.textContent).toContain('Include the pins?')
  expect(document.querySelector<HTMLInputElement>('[name="x"]')!.value).toBe('43')
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
  document.querySelector<HTMLButtonElement>('#apply-suggestions')!.click()
  expect(document.querySelector<HTMLInputElement>('[name="x"]')!.value).toBe('43')
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
  document.querySelector<HTMLButtonElement>('#apply-suggestions')!.click()
  expect(document.querySelector<HTMLInputElement>('[name="x"]')!.value).toBe('42')
  expect(document.querySelector<HTMLSelectElement>('[name="dimensions_source"]')!.value).toBe(
    'estimated',
  )
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/properties'))).toBe(false)
})
it.each([
  [
    'authentication',
    'Gemini authentication failed. Ask the server operator to update its API key.',
    false,
  ],
  [
    'quota',
    'Gemini quota is exhausted. Wait for its reset or ask the server operator to check quota.',
    false,
  ],
  ['overload', 'Gemini is overloaded. Try again shortly.', true],
])(
  'shows actionable Gemini %s errors and preserves manual drafts and saved estimates',
  async (category, message, retryable) => {
    const detail = `${message} Manual property entry remains available.`
    const fetch = vi.fn(async (url: string, init?: RequestInit) =>
      url.endsWith('/suggestions')
        ? init?.method === 'POST'
          ? json({ detail, category, retryable, manual_entry_available: true }, 503)
          : json(suggestion)
        : json(record),
    )
    await start(fetch)
    change('x', '43')
    document.querySelector<HTMLButtonElement>('#cached-suggestions')!.click()
    await vi.waitFor(() => expect(document.body.textContent).toContain('Include the pins?'))
    document.querySelector<HTMLButtonElement>('#refresh-suggestions')!.click()
    await vi.waitFor(() => expect(document.body.textContent).toContain(detail))
    expect(document.body.textContent).toContain('Include the pins?')
    const manual = document.querySelector<HTMLInputElement>('[name="x"]')!
    expect(manual.value).toBe('43')
    expect(manual.disabled).toBe(false)
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/properties'))).toBe(false)
  },
)
it('preserves newer orientation edits when an earlier PATCH completes and keeps processing blocked', async () => {
  let finishSave!: (response: Response) => void
  let pending = true
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/orientation')) {
      if (pending)
        return new Promise<Response>((resolve) => {
          finishSave = resolve
        })
      return json({ ...record, orientation: JSON.parse(init!.body as string) })
    }
    if (url.endsWith('/process')) return json({ ...record, status: 'preparing' })
    return json(record)
  })
  await start(fetch)
  change('x_deg', '90')
  document
    .querySelector<HTMLFormElement>('#orientation')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(finishSave).toBeTypeOf('function'))
  change('x_deg', '45')
  change('z_deg', '10')
  finishSave(json({ ...record, orientation: { x_deg: 90, y_deg: 0, z_deg: 0 } }))
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain('Newer rotation edits remain unsaved'),
  )
  expect(document.querySelector<HTMLButtonElement>('#process')!.disabled).toBe(true)
  expect(document.querySelector<HTMLInputElement>('[name="x_deg"]')!.value).toBe('45')
  expect(document.querySelector<HTMLInputElement>('[name="z_deg"]')!.value).toBe('10')
  expect(document.body.textContent).toContain('Newer rotation edits remain unsaved')
  document.querySelector<HTMLButtonElement>('#process')!.click()
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/process'))).toBe(false)
  pending = false
  document
    .querySelector<HTMLFormElement>('#orientation')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(document.body.textContent).toContain('Orientation saved. Review'))
  document.querySelector<HTMLButtonElement>('#process')!.click()
  await vi.waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/process'))).toBe(false),
  )
  const calls = fetch.mock.calls.filter(([url]) => url.endsWith('/orientation'))
  expect(JSON.parse(calls[1][1]!.body as string)).toEqual({ x_deg: 45, y_deg: 0, z_deg: 10 })
})
it.each(['orientation', 'properties'] as const)(
  'ignores a GET started before the %s save when it arrives after the PATCH',
  async (kind) => {
    let finishRefresh!: (response: Response) => void
    let gets = 0
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/orientation'))
        return json({ ...record, orientation: JSON.parse(init!.body as string) })
      if (url.endsWith('/properties'))
        return json({ ...record, properties: JSON.parse(init!.body as string) })
      gets++
      return gets === 1
        ? json(record)
        : new Promise<Response>((resolve) => {
            finishRefresh = resolve
          })
    })
    await start(fetch)
    document.querySelector<HTMLButtonElement>('#refresh')!.click()
    await vi.waitFor(() => expect(finishRefresh).toBeTypeOf('function'))
    // The job GET remains pending; wait for independent source revalidation before saving.
    await vi.waitFor(() =>
      expect(document.querySelector('#target-review-status')?.textContent).toContain(
        'Target reviewed by you',
      ),
    )
    change(kind === 'orientation' ? 'x_deg' : 'x', kind === 'orientation' ? '90' : '44')
    document
      .querySelector<HTMLFormElement>(kind === 'orientation' ? '#orientation' : '#properties')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        kind === 'orientation' ? 'Orientation saved' : 'Properties saved',
      ),
    )
    finishRefresh(json(record))
    // Let the released Response body and the refresh continuation finish before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(
      document.querySelector<HTMLInputElement>(
        kind === 'orientation' ? '[name="x_deg"]' : '[name="x"]',
      )!.value,
    ).toBe(kind === 'orientation' ? '90' : '44')
  },
)
