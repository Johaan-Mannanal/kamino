import { describe, expect, it } from 'vitest'
import { canDownloadBundle, canRetry, preparedMeshPath } from './pipeline'
import type { Job } from './types'

const job = {
  status: 'awaiting_properties',
  progress: 100,
  mesh_path: 'reconstruction/mesh.glb',
  properties: {},
  export_path: null,
  bundle_path: null,
  asset: null,
  error: null,
} as unknown as Job
describe('pipeline contract', () => {
  it('does not offer a ZIP at 100% reconstruction or on failed validation', () => {
    expect(canDownloadBundle(job)).toBe(false)
    expect(
      canDownloadBundle({ ...job, status: 'failed', bundle_path: 'attempts/old/simulation.zip' }),
    ).toBe(false)
    expect(canDownloadBundle({ ...job, status: 'completed', bundle_path: null })).toBe(false)
    expect(
      canDownloadBundle({
        ...job,
        status: 'completed',
        bundle_path: 'attempts/one/simulation.zip',
      }),
    ).toBe(true)
  })
  it('resolves prepared meshes relative to the exported scene', () => {
    const asset = { visual_mesh: 'meshes/visual.obj' } as Job['asset']
    expect(preparedMeshPath({ ...job, asset })).toBe(null)
    expect(preparedMeshPath({ ...job, asset, export_path: 'attempts/one/bundle/scene.xml' })).toBe(
      'attempts/one/bundle/meshes/visual.obj',
    )
  })
  it('allows simulation recovery while blocking paid reconstruction retries', () => {
    expect(
      canRetry({ ...job, status: 'failed', error: { code: 'validation_failed', message: '' } }),
    ).toBe(true)
    expect(
      canRetry({ ...job, status: 'failed', error: { code: 'provider_failed', message: '' } }),
    ).toBe(false)
  })
})
