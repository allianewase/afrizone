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
  /** Reason for the latest REJECTED verdict (from Smile ID or an admin note), if any. */
  kycNote?: string | null;
  location?: string | null;
  rating?: number | null;
  completedCount?: number;
  bankMasked?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
  tin?: string | null;
  /** Whether the user has TOTP 2FA enabled. */
  totpEnabled?: boolean;
  accountType?: AccountType;
  notifTasks?: boolean;
  notifPay?: boolean;
  notifEmail?: boolean;
  createdAt?: string;
}

/**
 * What kind of outside party this account is. Decides which dashboard the app
 * lands on after sign-in.
 *
 * NOT the same as being a member of a store. Someone can be an INDIVIDUAL and
 * still work at their family's shop - accountType is how they primarily use the
 * platform, StoreMember is what they may actually touch. The server enforces
 * the second; this only chooses a starting screen.
 */
export type AccountType = 'INDIVIDUAL' | 'STORE' | 'COURIER';

/**
 * STORE fulfils orders, COURIER delivers them. One model, because both need the
 * same membership, approval and payout structure - what differs is the work
 * they receive.
 *
 * An individual courier has NO organization: they are a plain user with
 * accountType COURIER. Anything courier-facing has to work for both.
 */
export type OrgKind = 'STORE' | 'COURIER';
export type OrgRole = 'OWNER' | 'STAFF';
export type OrgStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

export interface Organization {
  id: string;
  kind: OrgKind;
  name: string;
  slug: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Last four digits only. The full number is returned to OWNERs alone. */
  bankMasked?: string | null;
  bankAccountNumber?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
  tin?: string | null;
  status: OrgStatus;
  createdAt?: string;
  /** This viewer's standing here, added by GET /api/organizations. */
  myRole?: OrgRole;
}

export interface OrgMember {
  id: string;
  userId: string;
  role: OrgRole;
  createdAt?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
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
  requiresIdentityVerified?: boolean;
  /** One-line summary for cards. Display only - it decides nothing. */
  requirementsSummary?: string | null;
  requirements?: TaskRequirements;
  /**
   * This worker, this task, decided by the server.
   *
   * The app must not recompute any part of this. It used to check the tier and
   * KYC status itself, which is how a card can end up promising work the server
   * then refuses - and being told you qualify and then turned away is worse
   * than being told the truth up front.
   */
  eligibility?: Eligibility | null;
  // present on GET /api/tasks/:id
  applications?: Application[];
}

export interface TaskRequirements {
  requiresIdentityVerified: boolean;
  skills: { id: string; name: string }[];
  credentialTypes: { id: string; name: string }[];
  version: number;
}

export type BlockerCode =
  | 'TIER'
  | 'IDENTITY'
  | 'SKILL'
  | 'CREDENTIAL_MISSING'
  | 'CREDENTIAL_PENDING'
  | 'CREDENTIAL_EXPIRED';

export interface Blocker {
  code: BlockerCode;
  ref: string | null;
  /** Already written for a worker to read. Show it as-is; never re-word it here. */
  message: string;
  /** Where to send them to fix it. null means there is nothing they can do. */
  fix: 'skills' | 'credentials' | 'kyc' | null;
}

export interface Eligibility {
  eligible: boolean;
  blockers: Blocker[];
  /** What they already meet. Shown as ticks - being blocked is not the whole story. */
  met: string[];
  checks: number;
}

export interface TaskEligibility {
  taskId: string;
  requirements: TaskRequirements;
  eligibility: Eligibility;
}

export interface Application {
  id: string;
  taskId: string;
  workerId: string;
  pitch?: string | null;
  status: AppStatus;
  reason?: string | null;
  paymentId?: string | null;
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
    | 'slots'
    | 'filledCount'
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
  /** short-lived (~5-min) 2FA challenge JWT: NOT a full session token */
  challenge: string;
}

/** /api/auth/login may return a full session OR a 2FA challenge. */
export type LoginResponse = AuthSuccess | TwoFactorRequired;

/** Type guard: did login return a 2FA challenge instead of a session? */
export function isTwoFactorRequired(r: LoginResponse): r is TwoFactorRequired {
  return (r as TwoFactorRequired).requires2fa === true;
}

/** POST /api/auth/2fa/setup: pending secret + provisioning material. */
export interface TwoFactorSetup {
  otpauthUrl: string;
  qrDataUrl: string;
  secret: string;
}

/** POST /api/auth/2fa/enable | disable. */
export interface TwoFactorStatus {
  enabled: boolean;
}

/** POST /api/auth/password/forgot: never enumerates accounts. */
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
 * Wallet transaction row: GET /api/me/transactions (v3).
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

/** Full payment detail: GET /api/me/payments/:id */
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

/** Worker's own timesheet: GET /api/me/timesheets */
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

/** Response of POST /api/clock: reflects latest event for the task. */
export interface ClockResult {
  event: ClockEvent;
  clockedIn: boolean;
  elapsedSeconds: number;
}

/** Response of GET /api/me/clock/:taskId: for resuming the active screen. */
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

/** Contract: GET /api/me/contracts (v3), joined with a task summary. */
export interface Contract {
  id: string;
  status: ContractStatus;
  signedAt?: string | null;
  signerName?: string | null;
  task?: Pick<Task, 'id' | 'title'>;
}

/** Individual rating record: GET /api/me/ratings */
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

/** Full contract detail: GET /api/me/contracts/:id */
export interface ContractDetail {
  id: string;
  status: ContractStatus;
  signedAt?: string | null;
  signerName?: string | null;
  createdAt: string;
  task: Pick<Task, 'id' | 'title' | 'category' | 'tier'>;
  sections: ContractSection[];
}

/**
 * One entry in the worker's notification inbox: GET /api/me/notifications
 *
 * The inbox is the DURABLE record of everything the platform tells a worker.
 * Push is best-effort on top of it and silently fails for anyone who declined
 * the permission, so this - not the push - is what a worker can rely on.
 */
export interface Notification {
  id: string;
  title: string;
  body: string;
  /** Deep-link payload, e.g. `{ screen: 'wallet' }`. Null if none was sent. */
  data: { screen?: string } | null;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
}

/** GET /api/me/notifications */
export interface NotificationPage {
  items: Notification[];
  unreadCount: number;
}

// ── Talent profile: skills and credentials ───────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  slug: string;
  group: string;
  active: boolean;
}

/** One of the worker's declared skills, joined with its catalogue entry. */
export interface MySkill {
  skillId: string;
  slug: string;
  name: string;
  group: string;
  years: number | null;
  /** Retired from the catalogue but kept on this worker's profile. */
  retired: boolean;
}

export interface CredentialType {
  id: string;
  name: string;
  slug: string;
  reviewMode: 'ADMIN_REVIEW' | 'SELF_DECLARED';
  issuerMode: 'THIRD_PARTY' | 'AFRIZONE';
  requiresExpiry: boolean;
  requiresReference: boolean;
  requiresFile: boolean;
  issuerHint: string | null;
  active: boolean;
}

/**
 * `state` is what to show; `status` is only what happens to be stored.
 *
 * They differ in two cases the server derives against the clock rather than
 * storing: a verified credential past its expiry is EXPIRED, and a
 * self-declared one is SELF_DECLARED rather than pretending to await a review
 * that will never happen. Always render `state`.
 */
export type CredentialState =
  | 'PENDING'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'REVOKED'
  | 'SELF_DECLARED';

export interface Credential {
  id: string;
  title: string;
  issuer: string | null;
  referenceNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  documentId: string | null;
  status: string;
  state: CredentialState;
  /** Whether Afrizone can currently rely on it. */
  valid: boolean;
  expiringSoon: boolean;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  credentialType: CredentialType;
}

export interface CredentialInput {
  credentialTypeId: string;
  title?: string;
  issuer?: string;
  referenceNumber?: string;
  issuedAt?: string | null;
  expiresAt?: string | null;
  documentId?: string | null;
}
