import { afterEach, expect, it, vi } from 'vitest'
import { liveApi, setApiToken } from './api'
import { assemblyApi } from './assembly-api'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const denied = () => json({ detail: 'Application access token required' }, 401)
const expired = { required: true, authenticated: false, public_student_access: true }
const active = { ...expired, authenticated: true, role: 'student' }
afterEach(() => { vi.unstubAllGlobals(); setApiToken('') })

it('renews expired browser access in place and retries the rejected save with identical inputs', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(json(expired)).mockResolvedValueOnce(json(active))
    .mockResolvedValueOnce(json(active)).mockResolvedValueOnce(json({ id: 'saved' }))
  vi.stubGlobal('fetch', fetch)
  const orientation = { x_deg: 90, y_deg: 0, z_deg: 0 }
  expect(await liveApi.saveOrientation('job', orientation)).toEqual({ id: 'saved' })
  expect(fetch.mock.calls.map(([, init]) => init.method)).toEqual(['PATCH', 'GET', 'POST', 'GET', 'PATCH'])
  expect(fetch.mock.calls[4]).toEqual(fetch.mock.calls[0])
  expect(orientation).toEqual({ x_deg: 90, y_deg: 0, z_deg: 0 })
})

it('shares renewal across concurrent Workspace downloads and Assembly reads', async () => {
  let authenticated = false
  let renewals = 0
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/session')) {
      if (init.method === 'POST') { renewals++; authenticated = true }
      return json(authenticated ? active : expired)
    }
    if (!authenticated) return denied()
    return url.endsWith('.zip') ? new Response('archive') : json({ id: 'assembly' })
  })
  vi.stubGlobal('fetch', fetch)
  const [zip, job] = await Promise.all([liveApi.file('job', 'simulation.zip'), assemblyApi.get('assembly')])
  expect(await zip.text()).toBe('archive')
  expect(job.id).toBe('assembly')
  expect(renewals).toBe(1)
})

it('stops after one confirmed renewal when the operation still returns 401', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(denied()).mockResolvedValueOnce(json(active))
    .mockResolvedValueOnce(denied())
  vi.stubGlobal('fetch', fetch)
  await expect(liveApi.process('job')).rejects.toMatchObject({ status: 401 })
  expect(fetch).toHaveBeenCalledTimes(3)
})

it.each([
  ['private deployment', json({ required: true, authenticated: false })],
  ['renewal unavailable', json({ detail: 'Unavailable' }, 503)],
])('leaves a rejected mutation unsubmitted when %s', async (_name, status) => {
  const fetch = vi.fn().mockResolvedValueOnce(denied()).mockResolvedValueOnce(status)
  vi.stubGlobal('fetch', fetch)
  await expect(liveApi.process('job')).rejects.toMatchObject({ status: 401 })
  expect(fetch).toHaveBeenCalledTimes(2)
})

it.each([401, 429, 503])('does not retry a provider or quota failure (HTTP %s)', async status => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ detail: 'Provider request failed' }, status))
  vi.stubGlobal('fetch', fetch)
  await expect(liveApi.suggestions('job', {})).rejects.toMatchObject({ status })
  expect(fetch).toHaveBeenCalledOnce()
})

it('does not replace explicit invalid credentials with student access', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(denied())
  vi.stubGlobal('fetch', fetch)
  setApiToken('invalid-explicit-code')
  await expect(liveApi.process('job')).rejects.toMatchObject({ status: 401 })
  expect(fetch).toHaveBeenCalledOnce()
})

it('does not retry an ambiguous transport failure after submission', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('connection lost'))
  vi.stubGlobal('fetch', fetch)
  await expect(liveApi.process('job')).rejects.toThrow('Cannot reach')
  expect(fetch).toHaveBeenCalledOnce()
})
