import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, liveApi, setApiToken } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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
  it('retains sanitized suggestion failure details and the server retry interval', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: 'Gemini is overloaded. Manual property entry remains available.',
            category: 'overload',
            retryable: true,
            manual_entry_available: true,
          }),
          { status: 503, headers: { 'Retry-After': '30' } },
        ),
      ),
    )
    await expect(liveApi.suggestions('job-id', {})).rejects.toMatchObject({
      status: 503,
      message: 'Gemini is overloaded. Manual property entry remains available. (HTTP 503)',
      category: 'overload',
      retryable: true,
      manual_entry_available: true,
      retryAfter: 30,
      retryAfterHeader: '30',
    })
  })
  it('preserves false retry flags and ignores unknown categories or mistyped metadata', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: 'Quota exhausted',
            category: 'quota',
            retryable: false,
            manual_entry_available: true,
          }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: 'Unavailable',
            category: 'private-provider-error',
            retryable: 'false',
            manual_entry_available: 1,
          }),
          { status: 503 },
        ),
      )
    vi.stubGlobal('fetch', fetch)
    await expect(liveApi.suggestions('job-id', {})).rejects.toMatchObject({
      category: 'quota',
      retryable: false,
      manual_entry_available: true,
    })
    await expect(liveApi.suggestions('job-id', {})).rejects.toMatchObject({
      status: 503,
      category: undefined,
      retryable: undefined,
      manual_entry_available: undefined,
      retryAfter: undefined,
    })
  })
  it('keeps authentication and validation messages and status without inventing suggestion fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              detail: [{ loc: ['body', 'mass_kg', 'value'], msg: 'must be positive' }],
            }),
            { status: 422 },
          ),
        ),
    )
    await expect(liveApi.get('job-id')).rejects.toMatchObject({
      message: 'Unauthorized (HTTP 401)',
      status: 401,
      category: undefined,
      retryable: undefined,
      manual_entry_available: undefined,
    })
    await expect(liveApi.get('job-id')).rejects.toMatchObject({
      message: 'mass_kg.value: must be positive (HTTP 422)',
      status: 422,
      category: undefined,
      retryable: undefined,
      manual_entry_available: undefined,
    })
    expect(new ApiError('Existing caller', 409)).toMatchObject({
      message: 'Existing caller',
      status: 409,
      retryAfter: undefined,
    })
    expect(new ApiError('Legacy busy caller', 429, 12)).toMatchObject({ retryAfter: 12 })
  })
  it('retains Retry-After when a busy response has no JSON body', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-21T07:27:00Z'))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Unavailable', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' },
        }),
      ),
    )
    await expect(liveApi.suggestions('job-id', {})).rejects.toMatchObject({
      message: 'Too Many Requests (HTTP 429)',
      status: 429,
      retryAfter: 60,
      retryAfterHeader: 'Wed, 21 Oct 2026 07:28:00 GMT',
    })
  })
})
