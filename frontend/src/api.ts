import type { TargetInventory, TargetReviewRequest } from './target-review'
import { fetchWithBrowserAccess } from './access'
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
  geometry(id: string, preview?: boolean): Promise<TargetInventory>
  reviewGeometry(id: string, request: TargetReviewRequest): Promise<Job>
  health(): Promise<{ status: string; provider: string }>
  create(files: File[]): Promise<Job>
  get(id: string): Promise<Job>
  save(id: string, properties: Properties): Promise<Job>
  saveOrientation(id: string, orientation: Orientation): Promise<Job>
  previewSizing(
    id: string,
    request: {
      sizing: Sizing
      geometry_scope?: 'reviewed_target' | 'whole_reconstruction'
      orientation: Orientation
      geometry_context_sha256?: string | null
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

export type ApiErrorDetails = {
  category?: string
  retryable?: boolean
  manual_entry_available?: boolean
  retryAfter?: number
  retryAfterHeader?: string
}

const suggestionErrorCategories = new Set([
  'not_configured',
  'authentication',
  'permission',
  'billing',
  'quota',
  'invalid_request',
  'malformed',
  'overload',
  'rate_limit',
  'deadline',
  'network',
  'busy',
  'model_unavailable',
  'provider',
])

export class ApiError extends Error implements ApiErrorDetails {
  status?: number
  category?: string
  retryable?: boolean
  manual_entry_available?: boolean
  retryAfter?: number
  retryAfterHeader?: string
  constructor(message: string, status?: number, metadata: ApiErrorDetails | number = {}) {
    super(message)
    const details = typeof metadata === 'number' ? { retryAfter: metadata } : metadata
    this.status = status
    this.category = details.category
    this.retryable = details.retryable
    this.manual_entry_available = details.manual_entry_available
    this.retryAfter = details.retryAfter
    this.retryAfterHeader = details.retryAfterHeader
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
    response = await fetchWithBrowserAccess(`${base}${path}`, {
      ...init,
      credentials: 'include',
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
    const details: ApiErrorDetails = {}
    const retryAfter = response.headers.get('Retry-After')
    if (retryAfter) {
      details.retryAfterHeader = retryAfter
      const seconds = Number(retryAfter)
      const delay = Number.isFinite(seconds)
        ? seconds
        : (Date.parse(retryAfter) - Date.now()) / 1000
      if (Number.isFinite(delay)) details.retryAfter = Math.max(0, delay)
    }
    try {
      const body = await response.json()
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        if (typeof body.category === 'string' && suggestionErrorCategories.has(body.category))
          details.category = body.category
        if (typeof body.retryable === 'boolean') details.retryable = body.retryable
        if (typeof body.manual_entry_available === 'boolean')
          details.manual_entry_available = body.manual_entry_available
      }
      detail =
        typeof body?.detail === 'string'
          ? body.detail
          : Array.isArray(body?.detail)
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
    throw new ApiError(
      `${detail || 'Request failed'} (HTTP ${response.status})`,
      response.status,
      details,
    )
  }
  return response.json() as Promise<T>
}

export const liveApi: Api = {
  geometry: (id, preview = false) =>
    request(`/api/jobs/${encodeURIComponent(id)}/geometry?preview=${preview}`),
  reviewGeometry: (id, review) =>
    request(`/api/jobs/${encodeURIComponent(id)}/geometry-review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(review),
    }),
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
      response = await fetchWithBrowserAccess(fileUrl(id, path), {
        credentials: 'include',
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
