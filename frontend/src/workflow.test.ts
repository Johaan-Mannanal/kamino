// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Job, Suggestions } from './types'
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
  properties: {
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
async function start(fetch: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetch)
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('#process')).not.toBeNull())
}
function change(name: string, value: string) {
  const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`)!
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
it('blocks processing on an orientation draft, preserves it on failure, then saves all angles before process', async () => {
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
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/process'))).toBe(true),
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
    expect(document.querySelector<HTMLButtonElement>('#process')!.disabled).toBe(false),
  )
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
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/process'))).toBe(true),
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
