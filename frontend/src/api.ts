import type { Job, Properties } from './types'

export type Api = {
  health(): Promise<{ status: string; provider: string }>
  create(files: File[]): Promise<Job>
  get(id: string): Promise<Job>
  save(id: string, properties: Properties): Promise<Job>
  fileUrl(id: string, path: string): string
}

export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) { super(message); this.status = status }
}

const base = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(`${base}${path}`, init) }
  catch { throw new ApiError('Cannot reach the API. Check that the backend is running and the API base URL is correct.') }
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail)
        ? body.detail.map((item: { msg?: string; loc?: string[] }) => `${item.loc?.slice(1).join('.') || 'Input'}: ${item.msg || 'invalid'}`).join('; ')
        : detail
    } catch { /* retain HTTP status text */ }
    throw new ApiError(`${detail || 'Request failed'} (HTTP ${response.status})`, response.status)
  }
  return response.json() as Promise<T>
}

export const liveApi: Api = {
  health: () => request('/api/health'),
  create: files => {
    const form = new FormData()
    files.forEach(file => form.append('images', file))
    return request('/api/jobs', { method: 'POST', body: form })
  },
  get: id => request(`/api/jobs/${encodeURIComponent(id)}`),
  save: (id, properties) => request(`/api/jobs/${encodeURIComponent(id)}/properties`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(properties)
  }),
  fileUrl: (id, path) => `${base}/api/jobs/${encodeURIComponent(id)}/files/${path.split('/').map(encodeURIComponent).join('/')}`
}
