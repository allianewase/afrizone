/**
 * Shapes the portal reads. Mirrors the server's own types for the endpoints an
 * outside party may reach - nothing more.
 */

/** What kind of outside party an account is. A separate axis from staff role. */
export type AccountType = 'INDIVIDUAL' | 'STORE' | 'COURIER'

export type OrgKind = 'STORE' | 'COURIER'
export type OrgRole = 'OWNER' | 'STAFF'
export type OrgStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

export interface User {
  id: string
  name: string
  email: string
  phone?: string | null
  role: string
  accountType?: AccountType
  kycStatus?: string
}

export interface AuthResponse {
  token?: string
  user?: User
  isNewUser?: boolean
  /** Staff accounts with 2FA get a challenge instead of a session. */
  requires2fa?: boolean
  challenge?: string
}

/** Where a business's CAC registration has got to. */
export type CacStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'

export interface Organization {
  id: string
  kind: OrgKind
  name: string
  slug: string
  phone?: string | null
  email?: string | null
  address?: string | null
  bankMasked?: string | null
  bankName?: string | null
  cacNumber?: string | null
  cacStatus?: CacStatus
  /** The name the registry holds, when it was consulted. */
  cacName?: string | null
  cacNote?: string | null
  status: OrgStatus
  myRole?: OrgRole
  /** Returned by the CAC submission, which answers with the updated business. */
  message?: string
}

export interface OrgMember {
  id: string
  userId: string
  role: OrgRole
  name?: string | null
  email?: string | null
}

/* ===== Courier onboarding ===== */

/**
 * WAITING is deliberately distinct from TODO. A rider who has uploaded a
 * document and is waiting on Afrizone has nothing left to do, and showing that
 * as incomplete sends them looking for work that is not theirs.
 */
export type StepState = 'DONE' | 'WAITING' | 'TODO' | 'PROBLEM'

export interface ReadinessStep {
  key: string
  label: string
  state: StepState
  /** Written by the server. No client composes this sentence. */
  detail: string
}

export interface CourierReadiness {
  ready: boolean
  steps: ReadinessStep[]
  /** TODO and PROBLEM steps only - the ones the courier can act on. */
  outstanding: number
  vehicle: { type: string; label: string; plateNumber: string | null } | null
  vehicleTypes: { value: string; label: string; requiresPlate: boolean }[]
}
