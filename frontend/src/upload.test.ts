// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Job } from './types'

const record: Job = {
  orientation: { x_deg: 0, y_deg: 0, z_deg: 0 },
  schema_version: '1.0',
  id: 'd415d0ce-07af-4eae-9a1d-cf81ebb227a0',
  status: 'awaiting_properties',
  provider: 'meshy',
  synthetic: false,
  progress: 100,
  created_at: '2026-10-23T22:00:00Z',
  updated_at: '2026-10-23T22:00:00Z',
  provider_task_id: 'test-provider-job',
  source_images: ['input.png'],
  mesh_path: 'mesh.glb',
  properties: null,
  asset: null,
  validation_path: null,
  bundle_path: null,
  export_path: null,
  error: null,
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_API_MODE', 'live')
  // jsdom lacks Blob URL allocation, used by the standalone demo's import.
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:test-only'
      }
      static revokeObjectURL() {}
    },
  )
  history.replaceState(null, '', '/')
  document.body.innerHTML = '<div id="app"></div>'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  document.body.innerHTML = ''
})

async function selectImage() {
  vi.doMock('./viewer', () => ({ mountViewer: () => () => {} }))
  await import('./main')
  const input = document.querySelector<HTMLInputElement>('#photos')!
  Object.defineProperty(input, 'files', {
    value: [new File(['test'], 'input.png', { type: 'image/png' })],
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

const uploadButton = () => document.querySelector<HTMLButtonElement>('#upload')!

it('requires new photo selection after success instead of creating a duplicate paid job', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(record), { status: 202 }))
  vi.stubGlobal('fetch', fetch)
  await selectImage()
  uploadButton().click()
  await vi.waitFor(() => expect(location.search).toContain(record.id))
  expect(uploadButton().disabled).toBe(true)
  uploadButton().click()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.selected')).toBeNull()
})

it('retains photos after a rejected upload so the user can retry', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Application token required' }), { status: 401 }),
    )
  vi.stubGlobal('fetch', fetch)
  await selectImage()
  uploadButton().click()
  await vi.waitFor(() => expect(document.body.textContent).toContain('HTTP 401'))
  expect(uploadButton().disabled).toBe(false)
  expect(document.querySelector('.selected')?.textContent).toContain('input.png')
})
