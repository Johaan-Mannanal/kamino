import type {
  Job,
  Orientation,
  Properties,
  Suggestions,
  ValidationReport,
  Sizing,
  SizingPreview,
} from './types'

export type Api = {
  health(): Promise<{ status: string; provider: string }>
  create(files: File[]): Promise<Job>
  get(id: string): Promise<Job>
  save(id: string, properties: Properties): Promise<Job>
  saveOrientation(id: string, orientation: Orientation): Promise<Job>
  previewSizing(
    id: string,
    request: {
      sizing: Sizing
      orientation: Orientation
      dimensions_m?: Properties['dimensions_m']
    },
  ): Promise<SizingPreview>
  cachedSuggestions(id: string): Promise<Suggestions>
  suggestions(
    id: string,
    request: { object_hint?: string; refresh?: boolean },
  ): Promise<Suggestions>
  process(id: string): Promise<Job>
  report(id: string, path: string): Promise<ValidationReport>
  file(id: string, path: string): Promise<Blob>
  fileUrl(id: string, path: string): string
}

export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

const base = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
let token = ''
export function setApiToken(value: string) {
  token = value.trim()
}
const fileUrl = (id: string, path: string) =>
  `${base}/api/jobs/${encodeURIComponent(id)}/files/${path.split('/').map(encodeURIComponent).join('/')}`

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init?.headers)),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  } catch {
    throw new ApiError(
      'Cannot reach the API. Check that the backend is running and the API base URL is correct.',
    )
  }
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail =
        typeof body.detail === 'string'
          ? body.detail
          : Array.isArray(body.detail)
            ? body.detail
                .map(
                  (item: { msg?: string; loc?: string[] }) =>
                    `${item.loc?.slice(1).join('.') || 'Input'}: ${item.msg || 'invalid'}`,
                )
                .join('; ')
            : detail
    } catch {
      /* retain HTTP status text */
    }
    throw new ApiError(`${detail || 'Request failed'} (HTTP ${response.status})`, response.status)
  }
  return response.json() as Promise<T>
}

export const liveApi: Api = {
  health: () => request('/api/health'),
  create: (files) => {
    const form = new FormData()
    files.forEach((file) => form.append('images', file))
    return request('/api/jobs', { method: 'POST', body: form })
  },
  get: (id) => request(`/api/jobs/${encodeURIComponent(id)}`),
  save: (id, properties) =>
    request(`/api/jobs/${encodeURIComponent(id)}/properties`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(properties),
    }),
  saveOrientation: (id, orientation) =>
    request(`/api/jobs/${encodeURIComponent(id)}/orientation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orientation),
    }),
  previewSizing: (id, sizing) =>
    request(`/api/jobs/${encodeURIComponent(id)}/sizing-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sizing),
    }),
  cachedSuggestions: (id) => request(`/api/jobs/${encodeURIComponent(id)}/suggestions`),
  suggestions: (id, suggestion) =>
    request(`/api/jobs/${encodeURIComponent(id)}/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(suggestion),
    }),
  process: (id) => request(`/api/jobs/${encodeURIComponent(id)}/process`, { method: 'POST' }),
  report: (id, path) =>
    request(
      `/api/jobs/${encodeURIComponent(id)}/files/${path.split('/').map(encodeURIComponent).join('/')}`,
    ),
  async file(id, path) {
    let response: Response
    try {
      response = await fetch(fileUrl(id, path), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    } catch {
      throw new ApiError('Download failed. Check your connection and try again.')
    }
    if (!response.ok)
      throw new ApiError(
        `Download failed (HTTP ${response.status}). Check API access and retry.`,
        response.status,
      )
    return response.blob()
  },
  fileUrl,
}
