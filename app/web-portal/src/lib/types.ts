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
  status: OrgStatus
  myRole?: OrgRole
}

export interface OrgMember {
  id: string
  userId: string
  role: OrgRole
  name?: string | null
  email?: string | null
}
