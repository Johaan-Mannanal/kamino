import type { ReviewProject, ReviewPackage } from './assembly-review'

export type AssemblyAttempt = {
  mapping_review_path?: string | null
  mapping_version?: number
  number: number
  revision: number
  status: string
  export_generated: boolean
  motion_validation_passed: boolean | null
  export_path: string | null
  validation_path: string | null
  bundle_path: string | null
  error: { code: string; message: string } | null
  export_config: { collision_mode: 'box' | 'convex_mesh'; exclude_joint_pairs: boolean }
}
export type AssemblyJob = {
  mapping_review_path?: string | null
  mapping_version?: number
  id: string
  name: string
  synthetic: boolean
  status: string
  revision: number
  project_path: string
  package_path: string
  export_generated: boolean
  motion_validation_passed: boolean | null
  export_path: string | null
  validation_path: string | null
  bundle_path: string | null
  error: { code: string; message: string } | null
  attempts: AssemblyAttempt[]
}

const base = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
let token = ''
export function setAssemblyToken(value: string) {
  token = value.trim()
}
async function request(path: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(base + path, {
      ...init,
      credentials: 'include',
      headers: {
        ...Object.fromEntries(new Headers(init?.headers)),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  } catch {
    throw Error('Cannot reach the API. Check the backend and API base URL.')
  }
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* retain status */
    }
    throw Error(`${detail} (HTTP ${response.status})`)
  }
  return response
}
const path = (id: string) => `/api/assembly-jobs/${encodeURIComponent(id)}`
const json = (body: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
export const assemblyApi = {
  async fromMeshes(
    name: string,
    units: 'm' | 'mm',
    synthetic: boolean,
    meshes: File[],
  ): Promise<AssemblyJob> {
    const form = new FormData()
    form.append('name', name)
    form.append('units', units)
    form.append('synthetic', String(synthetic))
    meshes.forEach((file) => form.append('meshes', file, file.name))
    return (await request('/api/assembly-jobs/from-meshes', { method: 'POST', body: form })).json()
  },
  async create(project: File, meshes: { path: string; file: File }[]): Promise<AssemblyJob> {
    const form = new FormData()
    form.append('project', project)
    meshes.forEach(({ path, file }) => form.append('meshes', file, path))
    return (await request('/api/assembly-jobs', { method: 'POST', body: form })).json()
  },
  async get(id: string): Promise<AssemblyJob> {
    return (await request(path(id))).json()
  },
  async save(id: string, project: ReviewProject, expected_revision: number): Promise<AssemblyJob> {
    return (
      await request(path(id) + '/revisions', {
        ...json({ project, expected_revision }),
        method: 'PUT',
      })
    ).json()
  },
  async process(
    id: string,
    expected_revision: number,
    config: { collision_mode: 'box' | 'convex_mesh'; exclude_joint_pairs: boolean } = {
      collision_mode: 'box',
      exclude_joint_pairs: false,
    },
    expected_mapping_version = 0,
  ): Promise<AssemblyJob> {
    return (
      await request(path(id) + '/process', {
        ...json({ expected_revision, expected_mapping_version, ...config }),
        method: 'POST',
      })
    ).json()
  },
  async saveMapping(
    id: string,
    expected_revision: number,
    expected_mapping_version: number,
    review: unknown,
  ): Promise<AssemblyJob> {
    return (
      await request(path(id) + '/mapping-review', {
        ...json({ expected_revision, expected_mapping_version, review }),
        method: 'PUT',
      })
    ).json()
  },
  async file(id: string, name: string): Promise<Blob> {
    return (
      await request(path(id) + '/files/' + name.split('/').map(encodeURIComponent).join('/'))
    ).blob()
  },
  async reviewPackage(job: AssemblyJob): Promise<ReviewPackage> {
    return JSON.parse(await (await this.file(job.id, job.package_path)).text())
  },
}
