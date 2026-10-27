const base = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export type AccessStatus = {
  authenticated?: boolean
  required?: boolean
  public_student_access?: boolean
  role?: 'student' | 'judge' | 'team'
  session_seconds?: number
}

export function accessDescription(status: AccessStatus): string {
  const seconds = status.session_seconds
  const duration = seconds
    ? seconds < 3600
      ? `${seconds / 60} minutes`
      : `${seconds / 3600} hours`
    : 'this session'
  return `Signed in${status.role ? ` as ${status.role}` : ''} for ${duration}. Refresh and new tabs keep access.`
}

async function request(method: string, code?: string): Promise<AccessStatus> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`${base}/api/session`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
      headers: code ? { Authorization: `Bearer ${code.trim()}` } : {},
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(
        typeof result.detail === 'string' ? result.detail : 'Sign-in failed. Try again.',
      )
    return result
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError)
      throw new Error(
        'Could not check team access. Check your connection and try again; no photos were uploaded.',
      )
    throw error
  } finally {
    clearTimeout(timer)
  }
}

let pendingStatus: Promise<AccessStatus> | undefined

export const browserAccess = {
  status(): Promise<AccessStatus> {
    if (!pendingStatus) {
      pendingStatus = request('GET').then(async (status) => {
        if (status.required && !status.authenticated && status.public_student_access) {
          await request('POST')
          const confirmed = await request('GET')
          if (!confirmed.authenticated)
            throw new Error('Could not establish browser access. Allow cookies for this site and refresh.')
          return confirmed
        }
        return status
      }).finally(() => { pendingStatus = undefined })
    }
    return pendingStatus
  },
  async signIn(code: string): Promise<AccessStatus> {
    // Finish a public bootstrap before replacing its cookie with a privileged session.
    await pendingStatus?.catch(() => {})
    return request('POST', code)
  },
  async signOut(): Promise<AccessStatus> {
    await pendingStatus?.catch(() => {})
    return request('DELETE')
  },
}

/** Retry only a rejection by our access middleware, before admission or provider work.
 * Callers supply replayable JSON/FormData bodies. Never retry ambiguous transport or
 * provider failures, or replace an explicitly supplied application credential.
 */
export async function fetchWithBrowserAccess(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, init)
  if (response.status !== 401 || new Headers(init.headers).has('Authorization')) return response
  try {
    const body = await response.clone().json()
    if (body?.detail !== 'Application access token required') return response
    const status = await browserAccess.status()
    if (!status.authenticated || init.signal?.aborted) return response
  } catch {
    // Preserve the original 401 so the workspace can offer in-place code entry.
    return response
  }
  // Deliberately not recursive: one rejected request gets at most one retry.
  return fetch(url, init)
}
