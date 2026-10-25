import { afterEach, expect, it, vi } from 'vitest'
import { assemblyApi, setAssemblyToken } from './assembly-api'

afterEach(() => {
  vi.unstubAllGlobals()
  setAssemblyToken('')
})

it('uploads project and named source meshes with application authentication', async () => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    expect(init.headers).toEqual({ Authorization: 'Bearer private-token' })
    const form = init.body as FormData
    expect((form.get('project') as File).name).toBe('project.json')
    expect((form.get('meshes') as File).name).toBe('meshes/arm.obj')
    return new Response(JSON.stringify({ id: 'job-1' }), { status: 202 })
  })
  vi.stubGlobal('fetch', fetch)
  setAssemblyToken('private-token')
  const job = await assemblyApi.create(new File(['{}'], 'project.json'), [
    { path: 'meshes/arm.obj', file: new File(['mesh'], 'arm.obj') },
  ])
  expect(job.id).toBe('job-1')
  expect(fetch).toHaveBeenCalledOnce()
})

it('sends revision preconditions and retrieves protected artifacts', async () => {
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/process')) {
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({
        expected_revision: 3,
        expected_mapping_version: 2,
        collision_mode: 'box',
        exclude_joint_pairs: false,
      })
      return new Response(JSON.stringify({ revision: 3 }), { status: 202 })
    }
    expect(url).toContain('/files/attempts/0001/bundle/validation.json')
    expect(init.headers).toEqual({ Authorization: 'Bearer private-token' })
    return new Response('report', { status: 200 })
  })
  vi.stubGlobal('fetch', fetch)
  setAssemblyToken('private-token')
  await assemblyApi.process('job-1', 3, undefined, 2)
  expect(
    await (await assemblyApi.file('job-1', 'attempts/0001/bundle/validation.json')).text(),
  ).toBe('report')
})

it('retains mapping evidence with revision and mapping-version preconditions', async () => {
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toContain('/api/assembly-jobs/job-1/mapping-review')
    expect(init.method).toBe('PUT')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer private-token')
    expect(JSON.parse(init.body as string)).toEqual({
      expected_revision: 3,
      expected_mapping_version: 2,
      review: { format: 'review' },
    })
    return new Response(JSON.stringify({ revision: 3, mapping_version: 3 }), { status: 201 })
  })
  vi.stubGlobal('fetch', fetch)
  setAssemblyToken('private-token')
  expect((await assemblyApi.saveMapping('job-1', 3, 2, { format: 'review' })).mapping_version).toBe(
    3,
  )
})
