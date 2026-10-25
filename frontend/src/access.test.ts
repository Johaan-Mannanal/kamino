import { afterEach, expect, it, vi } from 'vitest'
import { browserAccess } from './access'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('exchanges a code for browser access without storing it or putting it in a URL', async () => {
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ authenticated: true }))),
    )
  vi.stubGlobal('fetch', fetch)
  await browserAccess.signIn(' private-code ')
  const [url, options] = fetch.mock.calls[0]
  expect(url).toMatch(/\/api\/session$/)
  expect(url).not.toContain('private-code')
  expect(options.credentials).toBe('include')
  expect(options.headers.Authorization).toBe('Bearer private-code')
  expect(options.method).toBe('POST')
  expect(options.body).toBeUndefined()
  await browserAccess.status()
  expect(fetch.mock.calls[1][1].headers.Authorization).toBeUndefined()
})

it('retains the dialog error for rejected access instead of reporting sign-in success', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Code not accepted' }), { status: 401 }),
      ),
  )
  await expect(browserAccess.signIn('wrong')).rejects.toThrow('Code not accepted')
})

it('stops a stalled access check without issuing any reconstruction request', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(new Error('aborted'))),
      ),
  )
  vi.stubGlobal('fetch', fetch)
  const pending = expect(browserAccess.status()).rejects.toThrow(/connection/i)
  await vi.advanceTimersByTimeAsync(15000)
  await pending
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[0][0]).toMatch(/\/api\/session$/)
})
