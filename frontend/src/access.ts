const base = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export type AccessStatus = {
  authenticated?: boolean
  required?: boolean
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

export const browserAccess = {
  status: () => request('GET'),
  signIn: (code: string) => request('POST', code),
  signOut: () => request('DELETE'),
}
