// TS types mirroring API_CONTRACT.md entities & responses.

export type Role = 'SUPER_ADMIN' | 'TASK_MANAGER' | 'HR_ADMIN' | 'WORKER'
export type Tier = 'STUDENT' | 'DISPATCH' | 'REMOTE' | 'PROMO' | 'TRADE'
export type KycStatus = 'PENDING' | 'VERIFIED' | 'TIER_APPROVED' | 'REJECTED'
export type PayModel = 'HOURLY' | 'FIXED'
export type LocationType = 'PHYSICAL' | 'REMOTE'
export type TaskStatus = 'OPEN' | 'FILLED' | 'CLOSED' | 'ARCHIVED'
export type AppStatus = 'APPLIED' | 'APPROVED' | 'REJECTED'
export type DisputeStatus = 'OPEN' | 'RESOLVED' | 'CLOSED'
export type DisputeEntityType = 'PAYMENT' | 'TIMESHEET'
export type TimesheetStatus = 'SUBMITTED' | 'APPROVED' | 'DISPUTED'
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'RELEASED' | 'DISPUTED'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  tiers: Tier[]
  kycStatus: KycStatus
  location?: string | null
  rating?: number | null
  completedCount: number
  bankMasked?: string | null
  createdAt?: string
  /** whether the admin account has TOTP 2FA enabled */
  totpEnabled?: boolean
}

export interface Task {
  id: string
  title: string
  description: string
  category: string
  tier: Tier
  payModel: PayModel
  rate?: number | null
  budget?: number | null
  startDate: string
  endDate: string
  locationType: LocationType
  address?: string | null
  lat?: number | null
  lng?: number | null
  geofenceRadius?: number
  slots: number
  status: TaskStatus
  deadline: string
  createdById?: string
  createdAt?: string
  // augmented by GET /api/tasks
  filledCount?: number
  applicantCount?: number
}

export interface WorkerSummary {
  id: string
  name: string
  tiers?: Tier[]
  kycStatus?: KycStatus
  rating?: number | null
}

export interface TaskSummary {
  id: string
  title: string
}

export interface Application {
  id: string
  taskId: string
  workerId: string
  pitch?: string | null
  status: AppStatus
  reason?: string | null
  createdAt?: string
  worker?: WorkerSummary
  task?: TaskSummary
}

export interface Timesheet {
  id: string
  taskId: string
  workerId: string
  periodStart: string
  periodEnd: string
  hours: number
  status: TimesheetStatus
  gpsNote?: string | null
  createdAt?: string
  slaHoursLeft?: number
  worker?: WorkerSummary
  task?: TaskSummary
}

export interface Payment {
  id: string
  workerId: string
  taskId: string
  gross: number
  whtRate: number
  whtAmount: number
  net: number
  status: PaymentStatus
  createdAt?: string
  worker?: WorkerSummary
  task?: TaskSummary
}

export interface Worker {
  id: string
  name: string
  email: string
  tiers: Tier[]
  kycStatus: KycStatus
  completedCount: number
  rating?: number | null
}

export interface WorkerDetail extends Worker {
  applications?: Application[]
}

export type KycDocType = 'ID' | 'SELFIE' | 'DOCS'

export interface KycDocument {
  id: string
  docType: KycDocType
  filename: string
  originalName: string
  mimeType: string
  url: string
  createdAt?: string
}

export interface SpendByCategory {
  label: string
  value: number
  tone?: string
}

export interface DashboardUrgent {
  type: string
  title: string
  sub: string
  count: number
}

export interface DashboardActivity {
  icon: string
  title: string
  sub: string
  ago: string
}

export interface DashboardStats {
  activeTasks: number
  fillRate: number
  avgTimeToFillHours: number
  spendThisMonth: number
  budgetThisMonth: number
  spendByCategory: SpendByCategory[]
  fill: { filled: number; open: number }
  urgent: DashboardUrgent[]
  activity: DashboardActivity[]
}

/** Full authentication success: a JWT plus the user record. */
export interface AuthSuccess {
  token: string
  user: User
}

/** Returned by /auth/login when the account has 2FA enabled. */
export interface TwoFactorRequired {
  requires2fa: true
  /** short-lived (~5 min) 2FA challenge JWT: not a full session token */
  challenge: string
}

/** /auth/login may return a full session OR a 2FA challenge. */
export type LoginResponse = AuthSuccess | TwoFactorRequired

export function isTwoFactorRequired(r: LoginResponse): r is TwoFactorRequired {
  return (r as TwoFactorRequired).requires2fa === true
}

/** /auth/2fa/setup: pending secret + provisioning material. */
export interface TwoFactorSetup {
  otpauthUrl: string
  qrDataUrl: string
  secret: string
}

/** /auth/2fa/enable and /auth/2fa/disable. */
export interface TwoFactorStatus {
  enabled: boolean
}

/** /auth/password/forgot: never enumerates accounts. */
export interface PasswordForgotResponse {
  sent: true
  /** only present in sim/dev mode */
  devToken?: string
}

/** /auth/password/reset. */
export interface PasswordResetResponse {
  ok: true
}

export interface SearchResults {
  tasks: { id: string; title: string; status: TaskStatus; category: string }[]
  workers: { id: string; name: string; email: string; kycStatus: KycStatus }[]
}

export interface Dispute {
  id: string
  workerId: string
  entityType: DisputeEntityType
  entityId: string
  reason: string
  status: DisputeStatus
  resolution?: string | null
  createdAt?: string
  updatedAt?: string
  worker?: { id: string; name: string }
  entity?: { title: string; gross?: number; net?: number } | null
}

export interface ReleaseAllResponse {
  released: number
  totalNet: number
}

// ===== v2: Hiring, Reports, Settings =====

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT'
export type JobStatus = 'OPEN' | 'CLOSED'
export type Stage = 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED'

export interface Job {
  id: string
  title: string
  department: string
  location: string
  employmentType: EmploymentType
  salaryMin?: number | null
  salaryMax?: number | null
  description: string
  needsCv?: boolean
  needsCover?: boolean
  needsPortfolio?: boolean
  closingDate: string
  status: JobStatus
  createdById?: string
  createdAt?: string
  // augmented by GET /api/jobs
  candidateCount?: number
}

export interface JobSummary {
  id: string
  title: string
}

export interface Candidate {
  id: string
  jobId: string
  name: string
  email: string
  phone?: string | null
  stage: Stage
  cvNote?: string | null
  rating?: number | null
  createdAt?: string
  updatedAt?: string
  job?: JobSummary
}

export interface TaxRate {
  id: string
  jurisdiction: string
  category: string
  whtRate: number
  vatRate: number
  active: boolean
}

export interface Category {
  id: string
  name: string
  tier: Tier
  defaultPayModel: PayModel
  active: boolean
}

export interface Template {
  key: string
  value: string
}

export interface HealthConfig {
  ready: boolean
  criticalIssues: string[]
  services: {
    paystack: { ok: boolean; mode: 'live' | 'simulated'; note: string }
    [key: string]: unknown
  }
}

export interface Funding {
  id: string
  amount: number
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  provider: 'paystack' | 'simulated' | null
  reference: string
  providerRef: string | null
  initiatedBy: string
  createdAt: string
  admin: { id: string; name: string }
  simulated?: boolean
  authorizationUrl?: string
}

/** A point in a rolling six-month series. `month` is the short label ("Jan");
 *  `monthStart` is the unambiguous calendar date (YYYY-MM-01) a time axis needs,
 *  since the window crosses a year boundary. */
interface MonthPoint {
  month: string
  monthStart: string
}

export interface ReportsSummary {
  spendByMonth: (MonthPoint & { spend: number })[]
  spendByCategory: { label: string; amount: number; pct: number }[]
  spendByDepartment: { label: string; amount: number }[]
  tax: { whtCollected: number; vatCollected: number; remittedToFirs: number }
  fillRateTrend: (MonthPoint & { rate: number })[]
  payrollEquivalent: {
    grossPaid: number
    totalWht: number
    netPaid: number
    workersPaid: number
  }
  topCategories: { label: string; tasks: number; spend: number }[]
}
