/**
 * Can this worker take this task?
 *
 * One place answers that question, and every caller - the apply endpoint, the
 * mobile task card, the admin's live qualifying-count - runs the same function
 * over the same shapes. A second implementation anywhere would eventually
 * disagree with this one, and the failure mode of disagreement here is a worker
 * told they qualify by a card and refused by the server.
 *
 * THREE THINGS THIS DELIBERATELY DOES NOT DO:
 *
 *   It does not query. Loading is separated from deciding (see the loaders
 *   below) because the callers have wildly different fan-out - one worker
 *   against one task, one worker against forty tasks, every worker against one
 *   hypothetical task - and only a pure decide() can serve all three without a
 *   query per pair. The list endpoint used to run 2N+1 queries; the loaders
 *   here are constant regardless of N.
 *
 *   It does not read the clock itself. `now` is threaded through every call, so
 *   a snapshot taken at approval time can be replayed and a test can pin a date
 *   without touching the system clock.
 *
 *   It does not decide whether a blocker blocks. It reports what is unmet;
 *   blockingBlockers() applies the kill-switch. Enforcement policy is a
 *   deployment concern and belongs at the edge, not inside the rules.
 */
import { isCredentialValid, tiersToArray, type Tier } from "../types";

// ── Shapes ───────────────────────────────────────────────────────────────────

export type BlockerCode =
  | "TIER"
  | "IDENTITY"
  | "SKILL"
  | "CREDENTIAL_MISSING"
  | "CREDENTIAL_PENDING"
  | "CREDENTIAL_EXPIRED";

/**
 * Where the worker goes to fix this. `null` means there is nothing they can do
 * from the app - a tier is granted by an admin, not applied for - and the UI
 * must not offer a button that leads nowhere.
 */
export type FixRoute = "skills" | "credentials" | "kyc" | null;

export type Blocker = {
  code: BlockerCode;
  /** The skillId / credentialTypeId / tier this is about. Machine handle, never shown. */
  ref: string | null;
  /**
   * Worker-facing, one line. No internal status names ever appear here: a
   * worker reading "CREDENTIAL_PENDING" learns nothing, and "We are still
   * checking your Driver Licence" tells them both what is happening and that
   * they need do nothing.
   */
  message: string;
  fix: FixRoute;
};

export type Eligibility = {
  eligible: boolean;
  blockers: Blocker[];
  /** Requirement labels this worker already satisfies. Drives the green ticks. */
  met: string[];
  /** How many checks this task applies at all. Zero means an ungated task. */
  checks: number;
};

/**
 * The best standing a worker has for one credential TYPE, not for one row. A
 * worker who uploaded a blurry licence, was rejected, and uploaded a clearer
 * one has two rows and one standing, and the gate cares only about the best.
 */
export type CredentialStanding = "VALID" | "PENDING" | "EXPIRED" | "REJECTED";

/** Everything about a worker that any requirement can ask about, resolved once. */
export type WorkerProfile = {
  id: string;
  name: string;
  tiers: Tier[];
  kycStatus: string;
  skillIds: Set<string>;
  credentialStanding: Map<string, CredentialStanding>;
};

export type TaskRequirements = {
  taskId: string;
  tier: string;
  requiresIdentityVerified: boolean;
  skills: { id: string; name: string }[];
  credentialTypes: { id: string; name: string }[];
  version: number;
};

/**
 * A KYC status meaning a person has confirmed this worker is who they say.
 * TIER_APPROVED implies VERIFIED and then some, so both pass.
 */
const IDENTITY_OK = new Set(["VERIFIED", "TIER_APPROVED"]);

/** Best-of, in descending order of usefulness to the gate. */
function betterStanding(
  a: CredentialStanding | undefined,
  b: CredentialStanding
): CredentialStanding {
  const rank: Record<CredentialStanding, number> = { VALID: 3, PENDING: 2, EXPIRED: 1, REJECTED: 0 };
  if (!a) return b;
  return rank[b] > rank[a] ? b : a;
}

// ── The decision ─────────────────────────────────────────────────────────────

/**
 * Pure. No I/O, no clock, no prisma. Given what is true about a worker and what
 * a task asks for, say whether the two meet and - when they do not - say
 * exactly what is missing, in words the worker can act on.
 */
export function decide(profile: WorkerProfile, req: TaskRequirements): Eligibility {
  const blockers: Blocker[] = [];
  const met: string[] = [];
  let checks = 0;

  // Tier. This check predates the requirements feature and is enforced
  // unconditionally (see blockingBlockers) - it is not new behaviour hiding
  // behind the new switch.
  checks += 1;
  if (profile.tiers.includes(req.tier as Tier)) {
    met.push(tierLabel(req.tier));
  } else {
    blockers.push({
      code: "TIER",
      ref: req.tier,
      message: `This is ${tierLabel(req.tier)} work, which is not on your account yet.`,
      fix: null,
    });
  }

  if (req.requiresIdentityVerified) {
    checks += 1;
    if (IDENTITY_OK.has(profile.kycStatus)) {
      met.push("ID confirmed");
    } else {
      blockers.push({
        code: "IDENTITY",
        ref: null,
        message:
          profile.kycStatus === "REJECTED"
            ? "Your ID could not be confirmed. Send a clearer photo to unlock this work."
            : "This job needs your ID confirmed first.",
        fix: "kyc",
      });
    }
  }

  for (const skill of req.skills) {
    checks += 1;
    if (profile.skillIds.has(skill.id)) {
      met.push(skill.name);
    } else {
      blockers.push({
        code: "SKILL",
        ref: skill.id,
        // Skills are the worker's own word, so the fix really is just to say
        // so. The wording avoids implying we will check it, because we will not.
        message: `Add "${skill.name}" to your skills.`,
        fix: "skills",
      });
    }
  }

  for (const ct of req.credentialTypes) {
    checks += 1;
    const standing = profile.credentialStanding.get(ct.id);
    if (standing === "VALID") {
      met.push(ct.name);
      continue;
    }
    if (standing === "PENDING") {
      blockers.push({
        code: "CREDENTIAL_PENDING",
        ref: ct.id,
        // Distinct from MISSING on purpose. Telling a worker to upload a
        // document they already uploaded reads as the app losing their work.
        message: `We are still checking your ${ct.name}.`,
        fix: "credentials",
      });
      continue;
    }
    if (standing === "EXPIRED") {
      blockers.push({
        code: "CREDENTIAL_EXPIRED",
        ref: ct.id,
        message: `Your ${ct.name} has expired. Upload the current one.`,
        fix: "credentials",
      });
      continue;
    }
    blockers.push({
      code: "CREDENTIAL_MISSING",
      ref: ct.id,
      // REJECTED lands here too. "Send a clearer copy" is what the worker
      // should do in both cases, and the rejection reason belongs on the
      // credentials screen where it can be shown in full, not on a task card.
      message:
        standing === "REJECTED"
          ? `Send a clearer copy of your ${ct.name}.`
          : `Upload your ${ct.name}.`,
      fix: "credentials",
    });
  }

  return { eligible: blockers.length === 0, blockers, met, checks };
}

/** "Dispatch" from "DISPATCH". Tier names are shown to workers; SHOUTING is not. */
export function tierLabel(tier: string): string {
  if (!tier) return "";
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

// ── The kill-switch ──────────────────────────────────────────────────────────

export const ENFORCE_SETTING_KEY = "eligibility.enforce";

/**
 * Is the requirements gate live?
 *
 * Defaults ON when the row is absent, and that is safe rather than bold:
 * migration 0008 defaults requiresIdentityVerified to false and creates no
 * requirement rows, so on the day this ships every existing task applies
 * exactly the checks it applied yesterday. A task only becomes gated when an
 * admin chooses requirements for it. The switch exists so that gate can be
 * pulled down with one PUT if something goes wrong in the pilot, without a
 * deploy.
 */
export async function isEnforcing(p: any): Promise<boolean> {
  const row = await p.setting.findUnique({ where: { key: ENFORCE_SETTING_KEY } });
  if (!row) return true;
  return String(row.value).toLowerCase() !== "off";
}

/**
 * Which blockers actually stop an application.
 *
 * TIER survives the switch being off. It is a pre-existing rule that this
 * feature merely absorbed, and turning the new gate off must not quietly delete
 * an old check - that would be a regression wearing a feature flag.
 */
export function blockingBlockers(blockers: Blocker[], enforcing: boolean): Blocker[] {
  return enforcing ? blockers : blockers.filter((b) => b.code === "TIER");
}

// ── Loaders ──────────────────────────────────────────────────────────────────

/**
 * One worker, three queries, regardless of how many tasks they will then be
 * checked against.
 */
export async function loadWorkerProfile(
  p: any,
  workerId: string,
  now: Date = new Date()
): Promise<WorkerProfile | null> {
  const user = await p.user.findUnique({
    where: { id: workerId },
    select: { id: true, name: true, tiers: true, kycStatus: true },
  });
  if (!user) return null;
  const [skills, credentials] = await Promise.all([
    p.workerSkill.findMany({ where: { workerId }, select: { skillId: true } }),
    p.credential.findMany({
      where: { workerId },
      select: { credentialTypeId: true, status: true, expiresAt: true },
    }),
  ]);
  return buildProfile(user, skills, credentials, now);
}

/**
 * Every worker at once, still three queries. This is what makes the admin's
 * live qualifying-count cheap enough to recompute as the task form is edited.
 */
export async function loadWorkerProfiles(p: any, now: Date = new Date()): Promise<WorkerProfile[]> {
  const users = await p.user.findMany({
    where: { role: "WORKER" },
    select: { id: true, name: true, tiers: true, kycStatus: true },
  });
  if (users.length === 0) return [];
  const ids = users.map((u: any) => u.id);
  const [skills, credentials] = await Promise.all([
    p.workerSkill.findMany({
      where: { workerId: { in: ids } },
      select: { workerId: true, skillId: true },
    }),
    p.credential.findMany({
      where: { workerId: { in: ids } },
      select: { workerId: true, credentialTypeId: true, status: true, expiresAt: true },
    }),
  ]);
  const skillsBy = new Map<string, any[]>();
  for (const s of skills) {
    const arr = skillsBy.get(s.workerId) ?? [];
    arr.push(s);
    skillsBy.set(s.workerId, arr);
  }
  const credsBy = new Map<string, any[]>();
  for (const c of credentials) {
    const arr = credsBy.get(c.workerId) ?? [];
    arr.push(c);
    credsBy.set(c.workerId, arr);
  }
  return users.map((u: any) =>
    buildProfile(u, skillsBy.get(u.id) ?? [], credsBy.get(u.id) ?? [], now)
  );
}

function buildProfile(user: any, skills: any[], credentials: any[], now: Date): WorkerProfile {
  const standing = new Map<string, CredentialStanding>();
  for (const c of credentials) {
    let s: CredentialStanding;
    if (isCredentialValid(c, now)) s = "VALID";
    else if (c.status === "PENDING") s = "PENDING";
    // VERIFIED but not valid can only mean the expiry date has passed - which
    // is the whole point of deriving expiry rather than storing it.
    else if (c.status === "VERIFIED") s = "EXPIRED";
    else s = "REJECTED";
    standing.set(c.credentialTypeId, betterStanding(standing.get(c.credentialTypeId), s));
  }
  return {
    id: user.id,
    name: user.name,
    tiers: tiersToArray(user.tiers),
    kycStatus: user.kycStatus,
    skillIds: new Set<string>(skills.map((s: any) => s.skillId)),
    credentialStanding: standing,
  };
}

/**
 * Requirements for many tasks in two queries.
 *
 * Takes the task rows the caller already has rather than re-fetching them, so
 * the list endpoint does not read the same rows twice.
 */
export async function loadTaskRequirements(
  p: any,
  tasks: { id: string; tier: string; requiresIdentityVerified: boolean; requirementsVersion: number }[]
): Promise<Map<string, TaskRequirements>> {
  const out = new Map<string, TaskRequirements>();
  for (const t of tasks) {
    out.set(t.id, {
      taskId: t.id,
      tier: t.tier,
      requiresIdentityVerified: t.requiresIdentityVerified,
      skills: [],
      credentialTypes: [],
      version: t.requirementsVersion,
    });
  }
  if (tasks.length === 0) return out;

  const ids = tasks.map((t) => t.id);
  const [skillReqs, credReqs] = await Promise.all([
    p.taskSkillRequirement.findMany({
      where: { taskId: { in: ids } },
      select: { taskId: true, skill: { select: { id: true, name: true } } },
    }),
    p.taskCredentialRequirement.findMany({
      where: { taskId: { in: ids } },
      select: { taskId: true, credentialType: { select: { id: true, name: true } } },
    }),
  ]);
  for (const r of skillReqs) out.get(r.taskId)?.skills.push(r.skill);
  for (const r of credReqs) out.get(r.taskId)?.credentialTypes.push(r.credentialType);
  // Stable order, so the summary string and the requirements card do not
  // reshuffle between two reads of the same task.
  for (const req of out.values()) {
    req.skills.sort((a, b) => a.name.localeCompare(b.name));
    req.credentialTypes.sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

// ── Presentation and record-keeping ──────────────────────────────────────────

/**
 * The one-line summary denormalised onto Task.requirementsSummary for list
 * cards. Never used to decide anything: a stale string on a card is harmless,
 * telling a worker the wrong reason they are blocked is not.
 */
export function summarise(req: TaskRequirements): string | null {
  const parts: string[] = [];
  if (req.requiresIdentityVerified) parts.push("ID confirmed");
  for (const c of req.credentialTypes) parts.push(c.name);
  for (const s of req.skills) parts.push(s.name);
  if (parts.length === 0) return null;
  if (parts.length <= 3) return parts.join(" · ");
  return `${parts.slice(0, 3).join(" · ")} +${parts.length - 3} more`;
}

/**
 * What was true when the application was accepted, frozen as JSON.
 *
 * Credentials expire and skills can be un-declared, so "were they eligible at
 * the time?" cannot be reconstructed from current state - and that is exactly
 * the question asked when something goes wrong on a job weeks later. Stored on
 * Application.eligibilitySnapshot at approval.
 */
export function snapshot(
  profile: WorkerProfile,
  req: TaskRequirements,
  el: Eligibility,
  now: Date
): string {
  return JSON.stringify({
    at: now.toISOString(),
    requirementsVersion: req.version,
    eligible: el.eligible,
    tier: req.tier,
    workerTiers: profile.tiers,
    kycStatus: profile.kycStatus,
    requiredIdentity: req.requiresIdentityVerified,
    requiredSkills: req.skills.map((s) => s.id),
    requiredCredentialTypes: req.credentialTypes.map((c) => c.id),
    // The standing of each REQUIRED type only. The worker's other credentials
    // are not what this application turned on and do not belong in the record.
    credentialStanding: Object.fromEntries(
      req.credentialTypes.map((c) => [c.id, profile.credentialStanding.get(c.id) ?? "MISSING"])
    ),
    blockers: el.blockers.map((b) => ({ code: b.code, ref: b.ref })),
  });
}
