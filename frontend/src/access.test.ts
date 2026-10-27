import { afterEach, expect, it, vi } from 'vitest'
import { browserAccess } from './access'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('automatically obtains a student cookie only when the server offers public access', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ required: true, authenticated: false, public_student_access: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, role: 'student', session_seconds: 1800 })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ required: true, authenticated: true, public_student_access: true, role: 'student', session_seconds: 1800 })))
  vi.stubGlobal('fetch', fetch)
  const access = await browserAccess.status()
  expect(access.role).toBe('student')
  expect(access.authenticated).toBe(true)
  expect(access.public_student_access).toBe(true)
  expect(fetch.mock.calls.map(([, options]) => options.method)).toEqual(['GET', 'POST', 'GET'])
  expect(fetch.mock.calls[1][1].headers).toEqual({})
  expect(fetch.mock.calls[1][1].credentials).toBe('include')
})

it.each([
  { required: true, authenticated: false },
  { required: false, authenticated: true },
  { required: true, authenticated: true, role: 'judge', public_student_access: true },
])('preserves existing access without silently requesting another session: %j', async (status) => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(status)))
  vi.stubGlobal('fetch', fetch)
  expect(await browserAccess.status()).toEqual(status)
  expect(fetch).toHaveBeenCalledOnce()
})

it('shares an in-flight public bootstrap and allows sign-out to clear the resulting cookie', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ required: true, authenticated: false, public_student_access: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, role: 'student', session_seconds: 1800 })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ required: true, authenticated: true, public_student_access: true, role: 'student', session_seconds: 1800 })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: false })))
  vi.stubGlobal('fetch', fetch)
  const first = browserAccess.status()
  const second = browserAccess.status()
  const signedOut = browserAccess.signOut()
  expect((await first).role).toBe('student')
  expect((await second).role).toBe('student')
  expect((await signedOut).authenticated).toBe(false)
  expect(fetch.mock.calls.map(([, options]) => options.method)).toEqual(['GET', 'POST', 'GET', 'DELETE'])
})

it('shows a failed public bootstrap without falling back to a code or uploading photos', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ required: true, authenticated: false, public_student_access: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Use HTTPS' }), { status: 400 }))
  vi.stubGlobal('fetch', fetch)
  await expect(browserAccess.status()).rejects.toThrow('Use HTTPS')
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('reports blocked cookies instead of claiming public access and looping on saved jobs', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ required: true, authenticated: false, public_student_access: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true, role: 'student', session_seconds: 1800 })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ required: true, authenticated: false, public_student_access: true })))
  vi.stubGlobal('fetch', fetch)
  await expect(browserAccess.status()).rejects.toThrow(/cookies/i)
  expect(fetch.mock.calls.map(([, options]) => options.method)).toEqual(['GET', 'POST', 'GET'])
})

it('describes the granted tier without promising every user a 12-hour session', async () => {
  const { accessDescription } = await import('./access')
  expect(accessDescription({ role: 'student', session_seconds: 1800 })).toContain('30 minutes')
  expect(accessDescription({ role: 'judge', session_seconds: 21600 })).toContain('6 hours')
  expect(accessDescription({ role: 'team', session_seconds: 43200 })).toContain('12 hours')
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
