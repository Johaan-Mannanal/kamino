import { afterEach, describe, expect, it, vi } from 'vitest'
import { liveApi, setApiToken } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
  setApiToken('')
})
describe('shared HTTP contract', () => {
  it('uses repeated images fields and lets the browser set multipart Content-Type', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }))
    vi.stubGlobal('fetch', fetch)
    await liveApi.create([
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
    ])
    const [url, init] = fetch.mock.calls[0]
    expect(url).toMatch(/\/api\/jobs$/)
    expect(init.method).toBe('POST')
    expect(init.body.getAll('images')).toHaveLength(2)
    expect(new Headers(init.headers).has('Content-Type')).toBe(false)
  })
  it('starts processing explicitly with an empty POST body', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }))
    vi.stubGlobal('fetch', fetch)
    await liveApi.process('job-id')
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/jobs\/job-id\/process$/)
    expect(fetch.mock.calls[0][1].method).toBe('POST')
    expect(fetch.mock.calls[0][1].body).toBeUndefined()
  })
  it('persists all fixed-axis orientation angles before processing', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })))
    vi.stubGlobal('fetch', fetch)
    await liveApi.saveOrientation('job-id', { x_deg: 90, y_deg: 0, z_deg: -15 })
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/jobs\/job-id\/orientation$/)
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'PATCH' })
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ x_deg: 90, y_deg: 0, z_deg: -15 })
  })
  it('requests cached Gemini suggestions without applying them to properties', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })))
    vi.stubGlobal('fetch', fetch)
    await liveApi.suggestions('job-id', { object_hint: 'Apple USB-C adapter', refresh: true })
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/jobs\/job-id\/suggestions$/)
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST' })
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      object_hint: 'Apple USB-C adapter',
      refresh: true,
    })
    await liveApi.cachedSuggestions('job-id')
    expect(fetch.mock.calls[1][0]).toMatch(/\/api\/jobs\/job-id\/suggestions$/)
    expect(fetch.mock.calls[1][1].method).toBeUndefined()
  })
  it('adds the private application token to artifact fetches', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('zip'))
    vi.stubGlobal('fetch', fetch)
    setApiToken('test-token')
    const blob = await liveApi.file('job-id', 'attempts/one/simulation.zip')
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
    expect(await blob.text()).toBe('zip')
  })
  it('reports network and validation failures without rewriting caller inputs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(liveApi.get('job-id')).rejects.toThrow('Cannot reach the API')
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail: 'Invalid properties' }), { status: 422 }),
        ),
    )
    await expect(liveApi.get('job-id')).rejects.toThrow('HTTP 422')
  })
})
