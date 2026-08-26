/**
 * Turning a fact into work (Blueprint §5).
 *
 * "The feature that makes PartTime powerful rather than just another gig board
 * is that the Afrizonemart platform creates work automatically." This is the
 * half of that which lives here: given something that happened, apply the rule
 * for that kind of work and put a properly gated task in front of the right
 * people.
 *
 * ONE GENERATOR, NOT FOUR. Every kind of auto-created task needs the same
 * things - a rule, a credential gate, a window, a de-duplication check - and
 * writing that per event type is how four subtly different definitions of
 * "already handled" come to exist.
 */
import { prisma } from "../prisma";
import { ruleFor, type TaskKind } from "./taskRules";
import { writeAudit, type AuditActor } from "../util/audit";

export interface GenerateInput {
  kind: TaskKind;
  title: string;
  description: string;
  category: string;
  /** The business this task is about, if any. */
  organizationId?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  locationType?: "PHYSICAL" | "REMOTE";
  /**
   * What makes this task a duplicate of another. Two events describing the same
   * situation must not put two people to work on it.
   */
  dedupe: { field: "organizationId" | "title"; value: string };
  actor: AuditActor;
}

export type GenerateResult =
  | { created: true; taskId: string }
  | { created: false; reason: "DUPLICATE"; taskId: string }
  | { created: false; reason: "NO_CREATOR" | "UNGATED_REFUSED"; taskId: null };

/**
 * Create the task, unless one already covers this.
 *
 * The de-duplication is the part worth being careful about. A shelf that stays
 * empty emits stock.low every time the threshold is checked; a listing missing
 * media stays missing until somebody photographs it. Without a rule that says
 * "there is already an open task for this", an hour of that produces an hour of
 * tasks and several people turn up to do the same job.
 */
export async function generateTask(input: GenerateInput): Promise<GenerateResult> {
  const rule = await ruleFor(input.kind);

  const where: Record<string, unknown> = {
    kind: input.kind,
    status: { in: ["OPEN", "FILLED"] },
  };
  where[input.dedupe.field] = input.dedupe.value;
  const existing = await prisma.task.findFirst({ where, select: { id: true } });
  if (existing) return { created: false, reason: "DUPLICATE", taskId: existing.id };

  // createdById is required and is attribution, not authorization. Work the
  // platform generated is still attributed to a person where one exists, so the
  // trail does not dead-end at "the system".
  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  });
  const createdById = input.actor.userId ?? admin?.id;
  if (!createdById) return { created: false, reason: "NO_CREATOR", taskId: null };

  const deadline = new Date(Date.now() + rule.windowDays * 24 * 60 * 60 * 1000);
  const task = await prisma.task.create({
    data: {
      kind: input.kind,
      organizationId: input.organizationId ?? null,
      title: input.title,
      description: input.description,
      category: input.category,
      tier: rule.tier,
      payModel: "FIXED",
      budget: rule.fee,
      startDate: new Date(),
      endDate: deadline,
      locationType: input.locationType ?? (input.address ? "PHYSICAL" : "REMOTE"),
      address: input.address ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      slots: 1,
      status: "OPEN",
      deadline,
      createdById,
      requiresIdentityVerified: rule.requiresIdentityVerified,
    },
  });

  const summaryParts: string[] = [];
  if (rule.requiresIdentityVerified) summaryParts.push("ID confirmed");

  if (rule.credentialSlug) {
    const credential = await prisma.credentialType.findUnique({
      where: { slug: rule.credentialSlug },
      select: { id: true, name: true },
    });
    if (credential) {
      await prisma.taskCredentialRequirement.create({
        data: { taskId: task.id, credentialTypeId: credential.id },
      });
      summaryParts.push(credential.name);
    } else {
      // A rule that names a credential the catalogue does not have produces an
      // UNGATED task - anybody could claim work that was meant to be qualified.
      // It is still created, because refusing would stop the operation on a
      // catalogue entry, but it must not happen quietly.
      await writeAudit(input.actor, "task.generated.ungated", "Task", task.id, {
        kind: input.kind,
        missingCredentialSlug: rule.credentialSlug,
      });
    }
  }

  if (summaryParts.length > 0) {
    await prisma.task.update({
      where: { id: task.id },
      data: { requirementsSummary: summaryParts.join(" · "), requirementsVersion: 1 },
    });
  }

  await writeAudit(input.actor, "task.generated", "Task", task.id, {
    kind: input.kind,
    fee: rule.fee,
    tier: rule.tier,
    organizationId: input.organizationId ?? null,
  });

  return { created: true, taskId: task.id };
}
