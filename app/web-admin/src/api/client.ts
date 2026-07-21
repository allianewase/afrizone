// Small typed fetch wrapper. Injects the JWT from localStorage and hits /api.
// In dev, Vite proxies /api -> http://localhost:4000 (VITE_API_URL unset).
// In production (frontend + API on separate domains), set VITE_API_URL to
// the API's origin, e.g. https://api.afrizoneparttime.com

import type {
  Application,
  AppStatus,
  AuthSuccess,
  Candidate,
  Category,
  DashboardStats,
  Dispute,
  DisputeStatus,
  Funding,
  HealthConfig,
  Job,
  KycDocument,
  LoginResponse,
  PasswordForgotResponse,
  PasswordResetResponse,
  Payment,
  PaymentStatus,
  ReleaseAllResponse,
  ReportsSummary,
  SearchResults,
  Stage,
  Task,
  TaxRate,
  Template,
  Timesheet,
  TimesheetStatus,
  TwoFactorSetup,
  TwoFactorStatus,
  User,
  Worker,
  WorkerDetail,
} from './types'

const TOKEN_KEY = 'afz_token'
export const API_ORIGIN: string = import.meta.env.VITE_API_URL ?? ''
const API_BASE = `${API_ORIGIN}/api`

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  // when true, a 401 will not be treated specially by callers
  signal?: AbortSignal
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const init: RequestInit = {
    method: opts.method ?? 'GET',
    headers,
    signal: opts.signal,
  }
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch {
    throw new ApiError(
      'Cannot reach the API. Is the backend running on http://localhost:4000?',
      0,
    )
  }

  if (res.status === 204) {
    return undefined as T
  }

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : null) ?? `Request failed (${res.status})`
    throw new ApiError(msg, res.status)
  }

  return data as T
}

// ===== typed endpoint helpers =====
export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request<{ user: User }>('/auth/me'),

  // Auth — 2FA
  twoFactorVerify: (challenge: string, code: string) =>
    request<AuthSuccess>('/auth/2fa/verify', {
      method: 'POST',
      body: { challenge, code },
    }),
  twoFactorSetup: () =>
    request<TwoFactorSetup>('/auth/2fa/setup', { method: 'POST' }),
  twoFactorEnable: (code: string) =>
    request<TwoFactorStatus>('/auth/2fa/enable', { method: 'POST', body: { code } }),
  twoFactorDisable: (code: string) =>
    request<TwoFactorStatus>('/auth/2fa/disable', { method: 'POST', body: { code } }),

  // Auth — Google SSO. May throw ApiError(503) when not configured.
  googleSignIn: (idToken: string) =>
    request<AuthSuccess>('/auth/google', { method: 'POST', body: { idToken } }),

  // Auth — password reset
  passwordForgot: (email: string) =>
    request<PasswordForgotResponse>('/auth/password/forgot', {
      method: 'POST',
      body: { email },
    }),
  passwordReset: (token: string, password: string) =>
    request<PasswordResetResponse>('/auth/password/reset', {
      method: 'POST',
      body: { token, password },
    }),

  // Search
  search: (q: string, signal?: AbortSignal) =>
    request<SearchResults>(`/search?q=${encodeURIComponent(q)}`, { signal }),

  // Dashboard
  dashboardStats: (signal?: AbortSignal) =>
    request<DashboardStats>('/dashboard/stats', { signal }),

  // Tasks
  tasks: (signal?: AbortSignal) => request<Task[]>('/tasks', { signal }),
  createTask: (body: Partial<Task>) =>
    request<Task>('/tasks', { method: 'POST', body }),
  task: (id: string, signal?: AbortSignal) =>
    request<Task & { applications: Application[] }>(`/tasks/${id}`, { signal }),

  // Applications
  applications: (status?: AppStatus, signal?: AbortSignal) =>
    request<Application[]>(
      `/applications${status ? `?status=${status}` : ''}`,
      { signal },
    ),
  approveApplication: (id: string) =>
    request<Application>(`/applications/${id}/approve`, { method: 'POST' }),
  rejectApplication: (id: string, reason: string) =>
    request<Application>(`/applications/${id}/reject`, {
      method: 'POST',
      body: { reason },
    }),

  // Timesheets
  timesheets: (status?: TimesheetStatus, signal?: AbortSignal) =>
    request<Timesheet[]>(
      `/timesheets${status ? `?status=${status}` : ''}`,
      { signal },
    ),
  approveTimesheet: (id: string) =>
    request<Timesheet>(`/timesheets/${id}/approve`, { method: 'POST' }),
  disputeTimesheet: (id: string, reason: string) =>
    request<Timesheet>(`/timesheets/${id}/dispute`, {
      method: 'POST',
      body: { reason },
    }),

  // Payments
  payments: (status?: PaymentStatus, signal?: AbortSignal) =>
    request<Payment[]>(
      `/payments${status ? `?status=${status}` : ''}`,
      { signal },
    ),
  releasePayment: (id: string) =>
    request<Payment>(`/payments/${id}/release`, { method: 'POST' }),
  releaseAll: () =>
    request<ReleaseAllResponse>('/payments/release-all', { method: 'POST' }),

  // Workers
  workers: (signal?: AbortSignal) => request<Worker[]>('/workers', { signal }),
  workerDetail: (id: string, signal?: AbortSignal) =>
    request<WorkerDetail>(`/workers/${id}`, { signal }),
  reviewKyc: (id: string, decision: 'TIER_APPROVED' | 'REJECTED') =>
    request<Worker>(`/workers/${id}/kyc`, { method: 'POST', body: { decision } }),
  workerKycDocuments: (id: string, signal?: AbortSignal) =>
    request<KycDocument[]>(`/workers/${id}/kyc/documents`, { signal }),
  rateWorker: (id: string, body: { taskId: string; score: number; note?: string }) =>
    request<{ id: string; rating: number | null; completedCount: number }>(
      `/workers/${id}/rate`,
      { method: 'POST', body },
    ),

  // ===== v2: Hiring =====
  jobs: (signal?: AbortSignal) => request<Job[]>('/jobs', { signal }),
  createJob: (body: Partial<Job>) =>
    request<Job>('/jobs', { method: 'POST', body }),
  job: (id: string, signal?: AbortSignal) =>
    request<Job & { candidates: Candidate[] }>(`/jobs/${id}`, { signal }),
  patchJob: (id: string, body: Partial<Job>) =>
    request<Job>(`/jobs/${id}`, { method: 'PATCH', body }),
  candidates: (jobId?: string, signal?: AbortSignal) =>
    request<Candidate[]>(
      `/candidates${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ''}`,
      { signal },
    ),
  createCandidate: (body: {
    jobId: string
    name: string
    email: string
    phone?: string
    cvNote?: string
  }) => request<Candidate>('/candidates', { method: 'POST', body }),
  moveCandidate: (id: string, stage: Stage) =>
    request<Candidate>(`/candidates/${id}/move`, { method: 'POST', body: { stage } }),

  // Disputes (admin)
  disputes: (status?: DisputeStatus | 'ALL', signal?: AbortSignal) =>
    request<Dispute[]>(
      `/disputes${status && status !== 'ALL' ? `?status=${status}` : ''}`,
      { signal },
    ),
  resolveDispute: (id: string, status: 'RESOLVED' | 'CLOSED', resolution?: string) =>
    request<Dispute>(`/disputes/${id}`, { method: 'PATCH', body: { status, resolution } }),

  // ===== v2: Reports =====
  reportsSummary: (signal?: AbortSignal) =>
    request<ReportsSummary>('/reports/summary', { signal }),

  healthConfig: (signal?: AbortSignal) => request<HealthConfig>('/health/config', { signal }),

  // ===== Platform funding (admin) =====
  fundingBalance: (signal?: AbortSignal) =>
    request<{ balance: number }>('/admin/funding/balance', { signal }),
  fundingHistory: (signal?: AbortSignal) =>
    request<Funding[]>('/admin/funding', { signal }),
  initializeFunding: (amount: number) =>
    request<Funding>('/admin/funding/initialize', { method: 'POST', body: { amount } }),
  devSettleFunding: () =>
    request<{ settled: number }>('/admin/funding/dev/settle', { method: 'POST' }),

  // ===== v2: Settings =====
  taxRates: (signal?: AbortSignal) =>
    request<TaxRate[]>('/settings/tax-rates', { signal }),
  createTaxRate: (body: Partial<TaxRate>) =>
    request<TaxRate>('/settings/tax-rates', { method: 'POST', body }),
  patchTaxRate: (id: string, body: Partial<TaxRate>) =>
    request<TaxRate>(`/settings/tax-rates/${id}`, { method: 'PATCH', body }),
  categories: (signal?: AbortSignal) =>
    request<Category[]>('/settings/categories', { signal }),
  createCategory: (body: Partial<Category>) =>
    request<Category>('/settings/categories', { method: 'POST', body }),
  patchCategory: (id: string, body: Partial<Category>) =>
    request<Category>(`/settings/categories/${id}`, { method: 'PATCH', body }),
  templates: (signal?: AbortSignal) =>
    request<Template[]>('/settings/templates', { signal }),
  putTemplate: (key: string, value: string) =>
    request<Template>(`/settings/templates/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: { value },
    }),
}
