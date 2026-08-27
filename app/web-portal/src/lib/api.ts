/**
 * The portal's API client.
 *
 * Deliberately small and separate from web-admin's. The portal talks to a
 * handful of endpoints that outside parties are allowed to reach; the staff
 * console talks to dozens they are not. Sharing one client would mean shipping
 * the map of every admin endpoint to a store's browser, which is the thing this
 * whole application exists to avoid.
 */
import type { AccountType, AuthResponse, Organization, OrgKind, OrgMember, User } from './types'

const TOKEN_KEY = 'afz_portal_token'
const API_BASE = `${import.meta.env.VITE_API_URL ?? ''}/api`

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    })
  } catch {
    throw new ApiError('Cannot reach Afrizone. Check your connection and try again.', 0)
  }

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`
    throw new ApiError(msg, res.status, data)
  }
  return data as T
}

export const api = {
  signIn: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),

  /**
   * accountType is what the person chose on the landing page. The server
   * validates it against its own list and falls back to INDIVIDUAL, so a
   * tampered value here cannot put an account into a state the guards do not
   * recognise.
   */
  register: (name: string, email: string, password: string, accountType: AccountType) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { name, email, password, accountType },
      auth: false,
    }),

  me: (signal?: AbortSignal) => request<{ user: User }>('/auth/me', { signal }),

  /** Only the businesses this person belongs to. The server does the scoping. */
  myOrganizations: (kind?: OrgKind, signal?: AbortSignal) =>
    request<Organization[]>(`/organizations${kind ? `?kind=${kind}` : ''}`, { signal }),

  organizationMembers: (id: string, signal?: AbortSignal) =>
    request<OrgMember[]>(`/organizations/${id}/members`, { signal }),

  /** Record the business's CAC registration number. OWNER only, server-side. */
  submitCac: (id: string, cacNumber: string) =>
    request<Organization>(`/organizations/${id}/cac`, { method: 'POST', body: { cacNumber } }),
}
