/**
 * How an event becomes a task, and who gets to decide.
 *
 * Blueprint §5 is explicit: "keep the rules configurable by Admin (thresholds,
 * target radius, required skill role, pay band) rather than hard-coded." So
 * every parameter a generator needs is a `Setting`, and raising a courier fee or
 * widening an audit's window is something somebody does on a screen rather than
 * something that needs a deploy.
 *
 * It also means MART DOES NOT SEND THESE. Mart tells us what happened; what that
 * is worth, who is qualified to do it, and how long they have are ours. A pay
 * band arriving in a Mart payload would mean changing Mart's code to pay
 * couriers more.
 *
 * Keys are `rules.<TASK_KIND>.<param>`, one convention for every generator. The
 * store audit had its own `audit.*` keys when it was the only one; they moved
 * here rather than being left as a second convention, because two ways of
 * configuring the same kind of thing is how the third one gets invented.
 */
import { prisma } from "../prisma";

export type TaskKind = "GENERAL" | "STORE_AUDIT" | "DELIVERY" | "SOURCING" | "MEDIA";

export interface TaskRule {
  /** Whole Naira. */
  fee: number;
  /** Which tier the work is offered to. */
  tier: string;
  /** Slug of the credential that gates it, or "" for ungated. */
  credentialSlug: string;
  /** Days from creation until the claim window closes. */
  windowDays: number;
  /** Whether a confirmed ID is required. */
  requiresIdentityVerified: boolean;
}

/**
 * Defaults, used when nobody has configured anything.
 *
 * The TIERS here are an admitted stopgap and it is worth knowing why before
 * "fixing" one. The blueprint describes Sourcing Agent, Auditor, Courier and
 * Field & Media as SKILL ROLES; the platform has only tiers, and none of them
 * means any of those. What actually gates each of these is the credential
 * below - the tier merely has to be one that real workers hold, which is why it
 * is configurable rather than asserted in code.
 */
const DEFAULTS: Record<TaskKind, TaskRule> = {
  GENERAL: {
    fee: 0,
    tier: "REMOTE",
    credentialSlug: "",
    windowDays: 7,
    requiresIdentityVerified: false,
  },
  STORE_AUDIT: {
    fee: 15000,
    tier: "TRADE",
    credentialSlug: "auditor-accreditation",
    windowDays: 7,
    requiresIdentityVerified: true,
  },
  SOURCING: {
    fee: 6000,
    tier: "DISPATCH",
    credentialSlug: "",
    windowDays: 2,
    // Sourcing means handling stock on Afrizone's behalf, so we want to know
    // who the person is even before the money question is settled.
    requiresIdentityVerified: true,
  },
  MEDIA: {
    fee: 4000,
    tier: "PROMO",
    credentialSlug: "",
    windowDays: 5,
    requiresIdentityVerified: false,
  },
  DELIVERY: {
    fee: 1500,
    tier: "DISPATCH",
    credentialSlug: "drivers-licence",
    windowDays: 1,
    requiresIdentityVerified: true,
  },
};

function key(kind: TaskKind, param: string): string {
  return `rules.${kind}.${param}`;
}

/** The rule in force for a kind of work, right now. */
export async function ruleFor(kind: TaskKind): Promise<TaskRule> {
  const base = DEFAULTS[kind] ?? DEFAULTS.GENERAL;
  const params = ["fee", "tier", "credentialSlug", "windowDays", "requiresIdentityVerified"];
  const rows = await prisma.setting.findMany({
    where: { key: { in: params.map((p) => key(kind, p)) } },
  });
  const set = new Map(rows.map((r) => [r.key, r.value]));

  const num = (p: string, fallback: number) => {
    const raw = set.get(key(kind, p));
    if (raw === undefined) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const str = (p: string, fallback: string) => {
    const raw = set.get(key(kind, p));
    // An explicitly empty value is a real answer - it is how an admin turns a
    // credential gate off - so it is distinguished from "not configured".
    return raw === undefined ? fallback : raw;
  };
  const bool = (p: string, fallback: boolean) => {
    const raw = set.get(key(kind, p));
    if (raw === undefined) return fallback;
    return raw.toLowerCase() === "true" || raw === "1";
  };

  return {
    fee: num("fee", base.fee),
    tier: str("tier", base.tier),
    credentialSlug: str("credentialSlug", base.credentialSlug),
    windowDays: num("windowDays", base.windowDays),
    requiresIdentityVerified: bool("requiresIdentityVerified", base.requiresIdentityVerified),
  };
}

/** Every rule, for an admin screen that shows what the generators will do. */
export async function allRules(): Promise<Record<string, TaskRule>> {
  const kinds = Object.keys(DEFAULTS) as TaskKind[];
  const out: Record<string, TaskRule> = {};
  for (const k of kinds) out[k] = await ruleFor(k);
  return out;
}

export { DEFAULTS as DEFAULT_TASK_RULES };
