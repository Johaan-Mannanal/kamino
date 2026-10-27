import type { Job } from './types'

const retryCodes = new Set([
  'processing_interrupted',
  'simulation_unavailable',
  'preparation_failed',
  'export_failed',
  'validation_failed',
  'packaging_failed',
  'storage_budget_exhausted',
  'publication_failed',
])
export function canRetry(job: Job | null): boolean {
  return (
    !!job &&
    job.status === 'failed' &&
    !!job.mesh_path &&
    !!job.properties &&
    retryCodes.has(job.error?.code || '')
  )
}
export function canDownloadBundle(job: Job | null): boolean {
  return job?.status === 'completed' && !!job.bundle_path
}
export function preparedMeshPath(job: Job | null): string | null {
  if (!job?.asset || !job.export_path) return null
  const index = job.export_path.lastIndexOf('/')
  const directory = index < 0 ? '' : job.export_path.slice(0, index + 1)
  return `${directory}${job.asset.visual_mesh}`
}
