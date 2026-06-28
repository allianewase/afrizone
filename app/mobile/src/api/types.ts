/** Types mirroring app/API_CONTRACT.md. Money fields are whole-Naira integers. */

export type Role = 'SUPER_ADMIN' | 'TASK_MANAGER' | 'HR_ADMIN' | 'WORKER';
export type Tier = 'STUDENT' | 'DISPATCH' | 'REMOTE' | 'PROMO' | 'TRADE';
export type KycStatus = 'PENDING' | 'VERIFIED' | 'TIER_APPROVED' | 'REJECTED';
export type PayModel = 'HOURLY' | 'FIXED';
export type LocationType = 'PHYSICAL' | 'REMOTE';
export type TaskStatus = 'OPEN' | 'FILLED' | 'CLOSED' | 'ARCHIVED';
export type AppStatus = 'APPLIED' | 'APPROVED' | 'REJECTED';
export type TimesheetStatus = 'SUBMITTED' | 'APPROVED' | 'DISPUTED';
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'RELEASED' | 'DISPUTED';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
export type JobStatus = 'OPEN' | 'CLOSED';
// v3 (worker-facing)
export type ClockType = 'IN' | 'OUT';
export type WithdrawalStatus = 'PROCESSING' | 'PAID';
export type ContractStatus = 'PENDING_SIGNATURE' | 'SIGNED';

export interface User {
  id: string;
  /** Workers who sign up via phone OTP may have a null name until KYC step 1. */
  name: string | null;
  /** Passwordless OTP workers may have no email until KYC step 1. */
  email: string | null;
  phone?: string | null;
  role: Role;
  tiers: Tier[];
  kycStatus: KycStatus;
  location?: string | null;
  rating?: number | null;
  completedCount?: number;
  bankMasked?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
  tin?: string | null;
  /** Whether the user has TOTP 2FA enabled. */
  totpEnabled?: boolean;
  notifTasks?: boolean;
  notifPay?: boolean;
  notifEmail?: boolean;
  createdAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  tier: Tier;
  payModel: PayModel;
  rate?: number | null;
  budget?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  locationType: LocationType;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  geofenceRadius?: number;
  slots: number;
  status: TaskStatus;
  deadline?: string | null;
  createdById?: string;
  createdAt?: string;
  // augmented by GET /api/tasks
  filledCount?: number;
  applicantCount?: number;
  // present on GET /api/tasks/:id
  applications?: Application[];
}

export interface Application {
  id: string;
  taskId: string;
  workerId: string;
  pitch?: string | null;
  status: AppStatus;
  reason?: string | null;
  createdAt?: string;
  // task summary joined by GET /api/me/applications (v3) / client-side for "My Tasks"
  task?: Pick<
    Task,
    | 'id'
    | 'title'
    | 'category'
    | 'tier'
    | 'payModel'
    | 'rate'
    | 'budget'
    | 'status'
    | 'address'
    | 'locationType'
    | 'startDate'
    | 'endDate'
  >;
}

export interface Payment {
  id: string;
  workerId: string;
  taskId: string;
  gross: number;
  whtRate: number;
  whtAmount: number;
  net: number;
  status: PaymentStatus;
  createdAt?: string;
  task?: Pick<Task, 'id' | 'title'>;
}

/** Derived wallet returned by GET /api/workers/:id. */
export interface Wallet {
  pending: number;
  available: number;
  withdrawn: number;
}

export interface WorkerDetail extends User {
  wallet?: Wallet;
  applications?: Application[];
  payments?: Payment[];
}

export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  employmentType: EmploymentType;
  salaryMin?: number | null;
  salaryMax?: number | null;
  description: string;
  needsCv?: boolean;
  needsCover?: boolean;
  needsPortfolio?: boolean;
  closingDate?: string | null;
  status: JobStatus;
  candidateCount?: number;
}

export type Stage = 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';

export interface JobCandidate {
  id: string;
  jobId: string;
  name: string;
  email: string;
  phone?: string | null;
  stage: Stage;
  cvNote?: string | null;
  rating?: number | null;
  createdAt?: string;
}

/** POST /api/auth/otp/request → body {phone}. `devCode` only in sim/dev. */
export interface OtpRequestResponse {
  sent: boolean;
  devCode?: string;
}

/** POST /api/auth/otp/verify → body {phone, code}. */
export interface VerifyOtpResponse {
  token: string;
  user: User;
  isNewUser: boolean;
}

/* ------------------------------------------------------------------ *
 * Multi-method auth (AUTH_FLOW §A2 / §B): email+password, Google, 2FA,
 * password reset. Shapes mirror the web-admin contract exactly.
 * ------------------------------------------------------------------ */

/** A full authenticated session: JWT + user record (+ isNewUser on register/Google). */
export interface AuthSuccess {
  token: string;
  user: User;
  isNewUser?: boolean;
}

/** POST /api/auth/login returns this when the account has 2FA enabled. */
export interface TwoFactorRequired {
  requires2fa: true;
  /** short-lived (~5-min) 2FA challenge JWT — NOT a full session token */
  challenge: string;
}

/** /api/auth/login may return a full session OR a 2FA challenge. */
export type LoginResponse = AuthSuccess | TwoFactorRequired;

/** Type guard: did login return a 2FA challenge instead of a session? */
export function isTwoFactorRequired(r: LoginResponse): r is TwoFactorRequired {
  return (r as TwoFactorRequired).requires2fa === true;
}

/** POST /api/auth/2fa/setup — pending secret + provisioning material. */
export interface TwoFactorSetup {
  otpauthUrl: string;
  qrDataUrl: string;
  secret: string;
}

/** POST /api/auth/2fa/enable | disable. */
export interface TwoFactorStatus {
  enabled: boolean;
}

/** POST /api/auth/password/forgot — never enumerates accounts. */
export interface PasswordForgotResponse {
  sent: true;
  /** only present in sim/dev mode */
  devToken?: string;
}

/** POST /api/auth/password/reset. */
export interface PasswordResetResponse {
  ok: true;
}

/**
 * Wallet transaction row — GET /api/me/transactions (v3).
 * Earnings + withdrawals merged newest-first.
 */
export interface Transaction {
  id: string;
  kind: 'earning' | 'withdrawal';
  title: string;
  amount: number;
  status: PaymentStatus | WithdrawalStatus;
  createdAt: string;
}

/** Full payment detail — GET /api/me/payments/:id */
export interface PaymentDetail {
  id: string;
  gross: number;
  whtRate: number;
  whtAmount: number;
  net: number;
  status: PaymentStatus;
  createdAt: string;
  task: Pick<Task, 'id' | 'title'>;
}

/** Worker's own timesheet — GET /api/me/timesheets */
export interface Timesheet {
  id: string;
  taskId: string;
  periodStart: string;
  periodEnd: string;
  hours: number;
  status: TimesheetStatus;
  createdAt: string;
  task: Pick<Task, 'id' | 'title'>;
}

/** ClockEvent persisted by POST /api/clock (v3). */
export interface ClockEvent {
  id: string;
  workerId: string;
  taskId: string;
  type: ClockType;
  lat?: number | null;
  lng?: number | null;
  withinFence: boolean;
  note?: string | null;
  createdAt: string;
}

/** Response of POST /api/clock — reflects latest event for the task. */
export interface ClockResult {
  event: ClockEvent;
  clockedIn: boolean;
  elapsedSeconds: number;
}

/** Response of GET /api/me/clock/:taskId — for resuming the active screen. */
export interface ClockState {
  clockedIn: boolean;
  lastEventAt?: string | null;
  elapsedSeconds: number;
}

/** Withdrawal created by POST /api/wallet/withdraw (v3). */
export interface Withdrawal {
  id: string;
  workerId: string;
  amount: number;
  bankMasked: string;
  status: WithdrawalStatus;
  createdAt: string;
}

/** Contract — GET /api/me/contracts (v3), joined with a task summary. */
export interface Contract {
  id: string;
  status: ContractStatus;
  signedAt?: string | null;
  task?: Pick<Task, 'id' | 'title'>;
}

/** Individual rating record — GET /api/me/ratings */
export interface Rating {
  id: string;
  taskId: string;
  score: number; // 1–5
  note?: string | null;
  createdAt: string;
  task: Pick<Task, 'id' | 'title'>;
}

export type DisputeStatus = 'OPEN' | 'RESOLVED' | 'CLOSED';
export type DisputeEntityType = 'PAYMENT' | 'TIMESHEET';

/** Dispute raised by a worker against a payment or timesheet. */
export interface Dispute {
  id: string;
  entityType: DisputeEntityType;
  entityId: string;
  reason: string;
  status: DisputeStatus;
  resolution?: string | null;
  createdAt: string;
  /** Entity summary joined server-side. */
  entity?: { title: string; gross?: number; net?: number } | null;
}

/** One section of the rendered contract document. */
export interface ContractSection {
  heading: string;
  body: string;
}

/** Full contract detail — GET /api/me/contracts/:id */
export interface ContractDetail {
  id: string;
  status: ContractStatus;
  signedAt?: string | null;
  createdAt: string;
  task: Pick<Task, 'id' | 'title' | 'category' | 'tier'>;
  sections: ContractSection[];
}
