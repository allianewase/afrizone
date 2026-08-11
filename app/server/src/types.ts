// Enum union types (SQLite stores these as String: see schema.prisma notes).

export type Role = "SUPER_ADMIN" | "TASK_MANAGER" | "HR_ADMIN" | "WORKER";
export type Tier = "STUDENT" | "DISPATCH" | "REMOTE" | "PROMO" | "TRADE";
export type KycStatus = "PENDING" | "VERIFIED" | "TIER_APPROVED" | "REJECTED";
export type PayModel = "HOURLY" | "FIXED";
export type LocationType = "PHYSICAL" | "REMOTE";
export type TaskStatus = "OPEN" | "FILLED" | "CLOSED" | "ARCHIVED";
export type AppStatus = "APPLIED" | "APPROVED" | "REJECTED";
export type TimesheetStatus = "SUBMITTED" | "APPROVED" | "DISPUTED";
export type PaymentStatus = "PENDING" | "APPROVED" | "RELEASED" | "DISPUTED";

// ── v2 enums ──────────────────────────────────────────────────────────────────
export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT";
export type JobStatus = "OPEN" | "CLOSED";
export type Stage = "SCREENING" | "INTERVIEW" | "OFFER" | "HIRED" | "REJECTED";

export const EMPLOYMENT_TYPES: EmploymentType[] = ["FULL_TIME", "PART_TIME", "CONTRACT"];
export const JOB_STATUSES: JobStatus[] = ["OPEN", "CLOSED"];
export const STAGES: Stage[] = ["SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];

export const ROLES: Role[] = ["SUPER_ADMIN", "TASK_MANAGER", "HR_ADMIN", "WORKER"];
export const TIERS: Tier[] = ["STUDENT", "DISPATCH", "REMOTE", "PROMO", "TRADE"];

// ── v3 enums (worker-facing mobile app) ────────────────────────────────────────
export type ClockType = "IN" | "OUT";
export type WithdrawalStatus = "PROCESSING" | "PAID" | "FAILED";
export type ContractStatus = "PENDING_SIGNATURE" | "SIGNED";

export const CLOCK_TYPES: ClockType[] = ["IN", "OUT"];
export const WITHDRAWAL_STATUSES: WithdrawalStatus[] = ["PROCESSING", "PAID", "FAILED"];
export const CONTRACT_STATUSES: ContractStatus[] = ["PENDING_SIGNATURE", "SIGNED"];

// ── auth enums ──────────────────────────────────────────────────────────────
export type OtpPurpose = "login";
export const OTP_PURPOSES: OtpPurpose[] = ["login"];

// tiers <-> comma-separated string helpers (SQLite has no scalar lists).
export function tiersToArray(s: string | null | undefined): Tier[] {
  if (!s) return [];
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean) as Tier[];
}

export function tiersToString(arr: Tier[] | string | null | undefined): string {
  if (!arr) return "";
  if (Array.isArray(arr)) return arr.join(",");
  return arr;
}
