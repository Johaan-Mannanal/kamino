// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { liveApi } from './api'

afterEach(() => vi.unstubAllGlobals())

it('sends a user Meshy key only on explicit reconstruction, never reads or downloads', async () => {
  const requests: { url: string; headers: Headers; body?: BodyInit | null }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, headers: new Headers(init.headers), body: init.body })
    return new Response('{}', { status: 200 })
  })
  const key = 'msy_per_request_private_key'
  await liveApi.create([new File(['photo'], 'photo.png')], key)
  await liveApi.get('one')
  await liveApi.file('one', 'old.zip')
  expect(requests[0].headers.get('X-Meshy-Key')).toBe(key)
  expect(requests[0].body).toBeInstanceOf(FormData)
  expect((requests[0].body as FormData).has('meshy_api_key')).toBe(false)
  expect(requests.slice(1).every((r) => !r.headers.has('X-Meshy-Key'))).toBe(true)
  expect(requests.every((r) => !r.url.includes(key))).toBe(true)
  await liveApi.create([new File(['another'], 'two.png')], 'msy_different_private_key')
  expect(requests[3].headers.get('X-Meshy-Key')).toBe('msy_different_private_key')
})
