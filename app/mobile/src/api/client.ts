import { API_BASE_URL, SECURE_TOKEN_KEY } from './config';
import { getItem } from '../lib/storage';
import type {
  OtpRequestResponse,
  VerifyOtpResponse,
  Task,
  WorkerDetail,
  Wallet,
  Job,
  JobCandidate,
  User,
  Application,
  ClockResult,
  ClockState,
  Transaction,
  Withdrawal,
  Contract,
  ContractDetail,
  Dispute,
  Rating,
  Timesheet,
  LoginResponse,
  AuthSuccess,
  TwoFactorSetup,
  TwoFactorStatus,
  PasswordForgotResponse,
  PasswordResetResponse,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Skip injecting the bearer token (e.g. for login). */
  auth?: boolean;
  signal?: AbortSignal;
}

/**
 * Thin fetch wrapper. Injects the JWT from secure storage, normalises errors to
 * ApiError, and JSON-encodes bodies. Base URL comes from api/config.ts.
 */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = opts;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = await getItem(SECURE_TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    // Network failure (backend down / offline). Surface a clear message.
    throw new ApiError(
      'Could not reach the Afrizone server. Check your connection and that the backend is running.',
      0
    );
  }

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : undefined) || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }

  return data as T;
}

/* ------------------------------------------------------------------ *
 * REAL endpoints (backed by app/server, per API_CONTRACT.md)
 * ------------------------------------------------------------------ */

export const api = {
  /** POST /api/auth/otp/request — request a login OTP for a phone number. */
  requestOtp(phone: string): Promise<OtpRequestResponse> {
    return request<OtpRequestResponse>('/auth/otp/request', {
      method: 'POST',
      body: { phone },
      auth: false,
    });
  },

  /** POST /api/auth/otp/verify — verify the code; returns {token, user, isNewUser}. */
  verifyOtp(phone: string, code: string): Promise<VerifyOtpResponse> {
    return request<VerifyOtpResponse>('/auth/otp/verify', {
      method: 'POST',
      body: { phone, code },
      auth: false,
    });
  },

  /* ---------------------------------------------------------------- *
   * Multi-method auth (AUTH_FLOW §A2): email/password, Google, 2FA,
   * password reset. Workers self-serve; new email/Google users are
   * auto-created as WORKERs (isNewUser: true) → KYC stepper.
   * ---------------------------------------------------------------- */

  /** POST /api/auth/login — email+password; full session OR {requires2fa, challenge}. */
  login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
  },

  /** POST /api/auth/register — create a WORKER; returns {token, user, isNewUser:true}. */
  register(name: string, email: string, password: string): Promise<AuthSuccess> {
    return request<AuthSuccess>('/auth/register', {
      method: 'POST',
      body: { name, email, password },
      auth: false,
    });
  },

  /** PATCH /api/me — update profile fields. Returns the updated user. */
  patchMe(input: {
    name?: string;
    email?: string;
    tin?: string;
    bankCode?: string;
    bankAccountNumber?: string;
    bankName?: string;
    notifTasks?: boolean;
    notifPay?: boolean;
    notifEmail?: boolean;
  }): Promise<User> {
    return request<User>('/me', { method: 'PATCH', body: input });
  },

  /** GET /api/me/tax-statement?year=YYYY → { csv: string, filename: string } */
  async taxStatement(year: number): Promise<{ csv: string; filename: string }> {
    const token = await getItem(SECURE_TOKEN_KEY);
    const headers: Record<string, string> = { Accept: 'text/csv' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/me/tax-statement?year=${year}`, { headers });
    } catch {
      throw new ApiError('Could not reach the Afrizone server. Check your connection.', 0);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(
        (body as { error?: string }).error ?? `Request failed (${res.status})`,
        res.status
      );
    }
    const csv = await res.text();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? `afrizone-wht-${year}.csv`;
    return { csv, filename };
  },

  /** POST /api/auth/2fa/verify — exchange a challenge + code for a session. */
  twoFactorVerify(challenge: string, code: string): Promise<AuthSuccess> {
    return request<AuthSuccess>('/auth/2fa/verify', {
      method: 'POST',
      body: { challenge, code },
      auth: false,
    });
  },

  /** POST /api/auth/google — worker context; auto-creates a WORKER if unknown. */
  googleSignIn(idToken: string): Promise<AuthSuccess> {
    return request<AuthSuccess>('/auth/google', {
      method: 'POST',
      body: { idToken, context: 'worker' },
      auth: false,
    });
  },

  /** POST /api/auth/password/forgot — neutral confirmation (+ devToken in sim). */
  passwordForgot(email: string): Promise<PasswordForgotResponse> {
    return request<PasswordForgotResponse>('/auth/password/forgot', {
      method: 'POST',
      body: { email },
      auth: false,
    });
  },

  /** POST /api/auth/password/reset — set a new password from a reset token. */
  passwordReset(token: string, password: string): Promise<PasswordResetResponse> {
    return request<PasswordResetResponse>('/auth/password/reset', {
      method: 'POST',
      body: { token, password },
      auth: false,
    });
  },

  /** POST /api/auth/2fa/setup (auth) — pending secret + QR for enrolment. */
  twoFactorSetup(): Promise<TwoFactorSetup> {
    return request<TwoFactorSetup>('/auth/2fa/setup', { method: 'POST' });
  },

  /** POST /api/auth/2fa/enable (auth) — confirm pending secret with a code. */
  twoFactorEnable(code: string): Promise<TwoFactorStatus> {
    return request<TwoFactorStatus>('/auth/2fa/enable', {
      method: 'POST',
      body: { code },
    });
  },

  /** POST /api/auth/2fa/disable (auth) — turn off 2FA (requires a current code). */
  twoFactorDisable(code: string): Promise<TwoFactorStatus> {
    return request<TwoFactorStatus>('/auth/2fa/disable', {
      method: 'POST',
      body: { code },
    });
  },

  /** GET /api/tasks — task feed (augmented with filledCount/applicantCount). */
  tasks(signal?: AbortSignal): Promise<Task[]> {
    return request<Task[]>('/tasks', { signal });
  },

  /** GET /api/tasks/:id — detail + applications. */
  task(id: string, signal?: AbortSignal): Promise<Task> {
    return request<Task>(`/tasks/${id}`, { signal });
  },

  /** GET /api/workers/:id — worker + derived wallet. */
  worker(id: string, signal?: AbortSignal): Promise<WorkerDetail> {
    return request<WorkerDetail>(`/workers/${id}`, { signal });
  },

  /** Convenience: wallet from worker detail. */
  async wallet(id: string, signal?: AbortSignal): Promise<Wallet> {
    const w = await this.worker(id, signal);
    return w.wallet ?? { pending: 0, available: 0, withdrawn: 0 };
  },

  /** GET /api/jobs — full-time openings (v2 contract; may not be enabled). */
  jobs(signal?: AbortSignal): Promise<Job[]> {
    return request<Job[]>('/jobs', { signal });
  },

  /** GET /api/jobs/:id — job detail. */
  jobById(id: string, signal?: AbortSignal): Promise<Job> {
    return request<Job>(`/jobs/${id}`, { signal });
  },

  /** POST /api/candidates — submit a job application. Returns the created candidate. */
  applyJob(input: {
    jobId: string;
    name: string;
    email: string;
    phone?: string | null;
    cvNote?: string;
  }): Promise<JobCandidate> {
    return request<JobCandidate>('/candidates', { method: 'POST', body: input });
  },

  /* ---------------------------------------------------------------- *
   * v3 — worker-facing endpoints (mobile app). All worker-scoped to
   * the JWT subject; no workerId is passed from the client.
   * ---------------------------------------------------------------- */

  /** GET /api/me — the authed worker's profile. */
  meWorker(signal?: AbortSignal): Promise<User> {
    return request<User>('/me', { signal });
  },

  /** GET /api/me/applications — my applications, each joined with a task summary. */
  myApplications(signal?: AbortSignal): Promise<Application[]> {
    return request<Application[]>('/me/applications', { signal });
  },

  /** POST /api/applications — apply to a task. */
  apply(taskId: string, pitch?: string): Promise<Application> {
    return request<Application>('/applications', {
      method: 'POST',
      body: { taskId, pitch },
    });
  },

  /** POST /api/clock — clock IN/OUT of a field task. */
  clock(input: {
    taskId: string;
    type: 'IN' | 'OUT';
    lat?: number | null;
    lng?: number | null;
  }): Promise<ClockResult> {
    return request<ClockResult>('/clock', { method: 'POST', body: input });
  },

  /** GET /api/me/clock/:taskId — resume state for the active-task screen. */
  clockState(taskId: string, signal?: AbortSignal): Promise<ClockState> {
    return request<ClockState>(`/me/clock/${taskId}`, { signal });
  },

  /** POST /api/timesheets — submit hours for admin approval (status SUBMITTED). */
  submitTimesheet(input: {
    taskId: string;
    periodStart: string;
    periodEnd: string;
    hours: number;
  }): Promise<unknown> {
    return request('/timesheets', { method: 'POST', body: input });
  },

  /** GET /api/me/wallet — derived balances. */
  myWallet(signal?: AbortSignal): Promise<Wallet> {
    return request<Wallet>('/me/wallet', { signal });
  },

  /** GET /api/me/transactions — earnings + withdrawals, newest-first. */
  myTransactions(signal?: AbortSignal): Promise<Transaction[]> {
    return request<Transaction[]>('/me/transactions', { signal });
  },

  /** POST /api/wallet/withdraw — request a payout (PROCESSING). */
  withdraw(amount: number): Promise<Withdrawal> {
    return request<Withdrawal>('/wallet/withdraw', {
      method: 'POST',
      body: { amount },
    });
  },

  /** GET /api/me/timesheets — worker's timesheet history, newest-first. */
  myTimesheets(signal?: AbortSignal): Promise<Timesheet[]> {
    return request<Timesheet[]>('/me/timesheets', { signal });
  },

  /** GET /api/me/ratings — worker's individual rating history, newest-first. */
  myRatings(signal?: AbortSignal): Promise<Rating[]> {
    return request<Rating[]>('/me/ratings', { signal });
  },

  /** GET /api/me/disputes — worker's disputes with entity summary. */
  myDisputes(signal?: AbortSignal): Promise<Dispute[]> {
    return request<Dispute[]>('/me/disputes', { signal });
  },

  /** POST /api/me/disputes — raise a dispute on a payment or timesheet. */
  raiseDispute(input: {
    entityType: 'PAYMENT' | 'TIMESHEET';
    entityId: string;
    reason: string;
  }): Promise<Dispute> {
    return request<Dispute>('/me/disputes', { method: 'POST', body: input });
  },

  /** GET /api/me/contracts — my contracts, joined with a task summary. */
  myContracts(signal?: AbortSignal): Promise<Contract[]> {
    return request<Contract[]>('/me/contracts', { signal });
  },

  /** GET /api/me/contracts/:id — full contract detail with rendered sections. */
  myContractDetail(id: string, signal?: AbortSignal): Promise<ContractDetail> {
    return request<ContractDetail>(`/me/contracts/${id}`, { signal });
  },

  /** POST /api/contracts/:id/sign — sign a contract. */
  signContract(id: string): Promise<Contract> {
    return request<Contract>(`/contracts/${id}/sign`, { method: 'POST' });
  },

  /**
   * POST /api/me/kyc/documents — upload a KYC document image.
   * Uses multipart/form-data (not JSON). Returns the created document record.
   */
  async uploadKycDocument(params: {
    docType: 'ID' | 'SELFIE' | 'DOCS';
    uri: string;
    mimeType: string;
    filename: string;
  }): Promise<{ id: string; docType: string }> {
    const token = await getItem(SECURE_TOKEN_KEY);

    const formData = new FormData();
    formData.append('docType', params.docType);
    formData.append('file', {
      uri: params.uri,
      type: params.mimeType,
      name: params.filename,
    } as unknown as Blob);

    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/me/kyc/documents`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });
    } catch {
      throw new ApiError('Could not reach the Afrizone server.', 0);
    }

    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!res.ok) {
      const msg =
        data && typeof data === 'object' && 'error' in data
          ? String((data as { error: unknown }).error)
          : `Upload failed (${res.status})`;
      throw new ApiError(msg, res.status);
    }
    return data as { id: string; docType: string };
  },

  /** PATCH /api/me/push-token — register or refresh the Expo push token. */
  registerPushToken(pushToken: string): Promise<{ ok: true }> {
    return request<{ ok: true }>('/me/push-token', {
      method: 'PATCH',
      body: { pushToken },
    });
  },

  /** POST /api/me/kyc/submit — worker KYC submission (sets kycStatus PENDING). */
  submitKyc(input: {
    tin?: string;
    bankMasked?: string;
    bankCode?: string;
    bankAccountNumber?: string;
    bankName?: string;
    tier?: string;
  }): Promise<User> {
    return request<User>('/me/kyc/submit', { method: 'POST', body: input });
  },
};
