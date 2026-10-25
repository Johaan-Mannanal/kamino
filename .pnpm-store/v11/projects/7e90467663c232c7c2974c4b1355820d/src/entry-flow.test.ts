// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PhotoPreviews } from './entry-screens'
import type { Job } from './types'

const record: Job = {
  schema_version: '1.0',
  id: 'd415d0ce-07af-4eae-9a1d-cf81ebb227a0',
  status: 'reconstructing',
  provider: 'meshy',
  synthetic: false,
  created_at: '',
  updated_at: '',
  progress: 25,
  source_images: ['input.png'],
  provider_task_id: null,
  mesh_path: null,
  properties: null,
  asset: null,
  validation_path: null,
  bundle_path: null,
  export_path: null,
  error: null,
  orientation: { x_deg: 0, y_deg: 0, z_deg: 0 },
}
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const button = (selector: string) => document.querySelector<HTMLButtonElement>(selector)!
const photo = (name: string, type = 'image/png') => new File(['fixture'], name, { type })
const select = (files: File[], selector = '#photos') => {
  const input = document.querySelector<HTMLInputElement>(selector)!
  Object.defineProperty(input, 'files', { configurable: true, value: files })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubEnv('VITE_API_MODE', 'live')
  vi.doMock('./viewer', () => ({ mountViewer: () => () => {} }))
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:local-photo')
      static revokeObjectURL = vi.fn()
    },
  )
  history.replaceState(null, '', '/')
  document.body.innerHTML = '<div id="app"></div>'
})
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  document.body.innerHTML = ''
})

it('opens Home without API activity and retains photo selection when navigating away and back', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await import('./main')
  expect(document.querySelector('h1')?.textContent).toBe('From photos to simulation.')
  button('[data-page="upload"]').click()
  select([photo('front.png')])
  button('[data-page="home"]').click()
  button('[data-page="upload"]').click()
  expect(document.querySelector('.selected')?.textContent).toContain('front.png')
  expect(fetch).not.toHaveBeenCalled()
})

it('appends, replaces and removes real user photos; rejects invalid additions without dropping the selection', async () => {
  await import('./main')
  button('[data-page="upload"]').click()
  select([photo('front.png')])
  select([photo('side.png')])
  expect(document.querySelectorAll('.selected')).toHaveLength(2)
  button('[data-replace="0"]').click()
  select([photo('above.webp', 'image/webp')], '#replace-photo')
  expect(document.querySelector('.selected')?.textContent).toContain('above.webp')
  select([photo('bad.txt', 'text/plain')])
  expect(document.querySelectorAll('.selected')).toHaveLength(2)
  expect(document.querySelector('.notice')?.textContent).toContain('use JPEG, PNG, or WebP')
  select([photo('third.png'), photo('fourth.png'), photo('fifth.png')])
  expect(document.querySelectorAll('.selected')).toHaveLength(2)
  expect(document.querySelector('.notice')?.textContent).toContain('Choose 1–4 photos')
  button('.remove').click()
  expect(document.querySelectorAll('.selected')).toHaveLength(1)
  expect(document.querySelector('.selected')?.textContent).toContain('side.png')
})

it('keeps Creating mesh until the backend supplies a ready mesh, and does not create duplicate jobs', async () => {
  let ready = false
  const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
    response(
      ready ? { ...record, status: 'awaiting_properties', mesh_path: 'mesh.glb' } : record,
      init?.method === 'POST' ? 202 : 200,
    ),
  )
  vi.stubGlobal('fetch', fetch)
  await import('./main')
  button('[data-page="upload"]').click()
  select([photo('front.png')])
  button('#upload').click()
  await vi.waitFor(() =>
    expect(document.querySelector('h1')?.textContent).toBe('Creating your mesh'),
  )
  await vi.advanceTimersByTimeAsync(6000)
  expect(document.querySelector('#properties')).toBeNull()
  expect(document.querySelector('h1')?.textContent).toBe('Creating your mesh')
  ready = true
  await vi.advanceTimersByTimeAsync(1000)
  expect(document.querySelector('#properties')).not.toBeNull()
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

it('locks photo edits and duplicate submission while the create request is pending', async () => {
  let finish!: (value: Response) => void
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      }),
  )
  vi.stubGlobal('fetch', fetch)
  await import('./main')
  button('[data-page="upload"]').click()
  select([photo('front.png')])
  button('#upload').click()
  select([photo('side.png')])
  button('#upload').dispatchEvent(new Event('click'))
  expect(document.querySelectorAll('.selected')).toHaveLength(1)
  expect(fetch).toHaveBeenCalledTimes(1)
  finish(response(record, 202))
  await vi.waitFor(() =>
    expect(document.querySelector('h1')?.textContent).toBe('Creating your mesh'),
  )
})

it('retains a failed reconstruction and exposes status refresh and a separate new upload', async () => {
  history.replaceState(null, '', `/?job=${record.id}`)
  const fetch = vi.fn(async () =>
    response({
      ...record,
      status: 'failed',
      error: { code: 'provider_failed', message: 'The provider could not finish.' },
    }),
  )
  vi.stubGlobal('fetch', fetch)
  await import('./main')
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain('Mesh creation needs attention'),
  )
  expect(document.body.textContent).toContain('The provider could not finish.')
  button('[data-page="upload"]').click()
  expect(document.body.textContent).toContain('Your previous job and its saved files are kept')
  button('[data-page="workspace"]').click()
  expect(document.body.textContent).toContain('Mesh creation needs attention')
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('opens the explicitly synthetic demo with no live API calls even in a live build', async () => {
  history.replaceState(null, '', '/?demo=synthetic')
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await import('./main')
  await vi.waitFor(() => expect(document.body.textContent).toContain('Synthetic cube demo'))
  await vi.advanceTimersByTimeAsync(5000)
  expect(document.querySelector('#properties')).not.toBeNull()
  expect(document.body.textContent).toContain('Synthetic geometry')
  expect(fetch).not.toHaveBeenCalled()
})

it('keeps manual and orientation drafts, saved values, warnings and prior downloads across entry navigation', async () => {
  history.replaceState(null, '', `/?job=${record.id}`)
  const properties = {
    dimensions_m: { x: 0.12, y: 0.1, z: 0.09, source: 'measured' as const },
    mass_kg: { value: 0.2, source: 'measured' as const },
    sliding_friction: null,
  }
  const orientation = { x_deg: 0, y_deg: 0, z_deg: 0 }
  const restored: Job = {
    ...record,
    status: 'awaiting_properties',
    mesh_path: 'mesh.glb',
    properties,
    orientation,
    attempts: [
      {
        id: 'old',
        status: 'failed',
        inputs_path: 'attempts/old/inputs.json',
        inputs: { input_revision: 1, properties, orientation },
        export_path: null,
        validation_path: null,
        bundle_path: 'attempts/old/simulation.zip',
      },
    ],
  }
  const fetch = vi.fn(async () => response(restored))
  vi.stubGlobal('fetch', fetch)
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('#properties')).not.toBeNull())
  const x = document.querySelector<HTMLInputElement>('[name="x"]')!
  x.value = '132'
  x.dispatchEvent(new Event('input', { bubbles: true }))
  const rotation = document.querySelector<HTMLInputElement>('[name="x_deg"]')!
  rotation.value = '15'
  rotation.dispatchEvent(new Event('input', { bubbles: true }))
  button('[data-page="upload"]').click()
  button('[data-page="home"]').click()
  button('[data-page="workspace"]').click()
  expect(document.querySelector<HTMLInputElement>('[name="x"]')!.value).toBe('132')
  expect(document.querySelector<HTMLInputElement>('[name="x_deg"]')!.value).toBe('15')
  expect(document.body.textContent).toContain('Rotation draft is not saved')
  expect(document.body.textContent).toContain('physical accuracy remain unverified')
  expect(document.body.textContent).toContain('Prior processing attempts (1)')
  expect(document.querySelector('[data-path="attempts/old/simulation.zip"]')).not.toBeNull()
  expect(restored.properties?.dimensions_m.x).toBe(0.12)
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('explains invalid saved-job links without calling the API or waiting indefinitely', async () => {
  history.replaceState(null, '', '/?job=invalid')
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await import('./main')
  expect(document.body.textContent).toContain('The saved job link is invalid')
  expect(document.querySelector('#photos')).not.toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})

it('does not attach stale request handlers to a replacement app mount', async () => {
  let finish!: (value: Response) => void
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    .mockImplementation(async () => response(record, 202))
  vi.stubGlobal('fetch', fetch)
  await import('./main')
  button('[data-page="upload"]').click()
  select([photo('first.png')])
  button('#upload').click()
  document.body.innerHTML = '<div id="app"></div>'
  vi.resetModules()
  await import('./main')
  finish(response(record, 202))
  await vi.advanceTimersByTimeAsync(20)
  button('[data-page="upload"]').click()
  select([photo('second.png')])
  button('#upload').click()
  await vi.waitFor(() => expect(document.body.textContent).toContain('Creating your mesh'))
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('releases local photo Blob URLs when files are replaced or the page is disposed', () => {
  const previews = new PhotoPreviews()
  const a = photo('a.png'),
    b = photo('b.png')
  previews.sync([a])
  previews.sync([a])
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  previews.sync([b])
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  previews.dispose()
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
})
