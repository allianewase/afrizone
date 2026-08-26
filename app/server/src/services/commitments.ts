/**
 * Escrow as state: money ring-fenced against work, without Part-Time ever
 * holding it (Blueprint §10, MART_INTEGRATION.md §7).
 *
 * The promise a worker gets is the same one custodial escrow gives them - their
 * pay is set aside the moment the contract goes live and released when the work
 * is accepted. The difference is entirely on our side of the wall: AfriZoneMart
 * holds the funds, so there is no float here, no reconciliation of a balance we
 * keep, and no licensing question.
 *
 * Which is also why nothing in this file ever claims something was PAID on its
 * own authority. Only Mart knows that, and a ledger that asserts payments it
 * cannot see is a ledger nobody can trust.
 */
import { prisma } from "../prisma";
import { auditData, type AuditActor } from "../util/audit";

export type CommitmentState = "COMMITTED" | "RELEASED" | "PAID" | "CANCELLED";
export const COMMITMENT_STATES: CommitmentState[] = [
  "COMMITTED",
  "RELEASED",
  "PAID",
  "CANCELLED",
];

/**
 * Legal moves.
 *
 * RELEASED cannot go back to COMMITTED: un-ring-fencing money that was already
 * declared payable is a cancellation with a reason, not a quiet reversal. PAID
 * is terminal for the same reason PAID is terminal on a contract - undoing a
 * payment is a refund, which is a new record.
 */
export const COMMITMENT_TRANSITIONS: Record<CommitmentState, CommitmentState[]> = {
  COMMITTED: ["RELEASED", "CANCELLED"],
  RELEASED: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};

export function canTransitionCommitment(from: string, to: string): boolean {
  if (!COMMITMENT_STATES.includes(from as CommitmentState)) return false;
  if (!COMMITMENT_STATES.includes(to as CommitmentState)) return false;
  return COMMITMENT_TRANSITIONS[from as CommitmentState].includes(to as CommitmentState);
}

/** What a person sees. Never the enum - "COMMITTED" tells a worker nothing. */
const LABELS: Record<CommitmentState, string> = {
  COMMITTED: "Set aside for you",
  RELEASED: "Approved, awaiting payment",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export function commitmentLabel(state: string): string {
  return LABELS[state as CommitmentState] ?? state;
}

export type CommitmentReason = "TASK_PAY" | "ORDER_FULFILMENT" | "DELIVERY_FEE" | "RETAINER";

/**
 * Ring-fence pay for an engagement that has just gone live.
 *
 * `amount` is null for hourly work and that is deliberate: the figure is not
 * knowable until hours are submitted, and putting an invented estimate in front
 * of a worker is worse than an honest "to be confirmed". It is trued up by
 * releaseForContract().
 *
 * Idempotent. The unique (contractId, reason) means a retried approval finds the
 * existing row rather than ring-fencing the same work twice - which the wallet
 * would then report as being owed double.
 */
export async function commitForContract(
  contractId: string,
  workerId: string,
  amount: number | null,
  actor: AuditActor,
  reason: CommitmentReason = "TASK_PAY"
) {
  const existing = await prisma.commitment.findUnique({
    where: { contractId_reason: { contractId, reason } },
  });
  if (existing) return existing;

  const created = await prisma.commitment.create({
    data: { contractId, workerId, amount, reason, status: "COMMITTED" },
  });
  await prisma.auditLog.create({
    data: auditData(actor, "commitment.committed", "Commitment", created.id, {
      contractId,
      workerId,
      amount,
      reason,
    }),
  });
  return created;
}

/**
 * The work was accepted, so the money becomes payable - and this is where an
 * hourly commitment finally gets its number.
 *
 * The amount is written from what was actually verified rather than from
 * whatever was estimated at the start. Both figures survive: the audit row
 * carries the before and after, so "what were they promised" and "what were they
 * owed" are separately answerable later, which is exactly the question a dispute
 * asks.
 */
export async function releaseForContract(
  contractId: string,
  finalAmount: number,
  actor: AuditActor,
  reason: CommitmentReason = "TASK_PAY"
) {
  const c = await prisma.commitment.findUnique({
    where: { contractId_reason: { contractId, reason } },
  });
  if (!c) return null;
  if (c.status !== "COMMITTED") return c;

  const updated = await prisma.commitment.update({
    where: { id: c.id },
    data: { status: "RELEASED", amount: finalAmount, releasedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: auditData(actor, "commitment.released", "Commitment", c.id, {
      contractId,
      committedAmount: c.amount,
      releasedAmount: finalAmount,
    }),
  });
  return updated;
}

/**
 * Mart says it paid.
 *
 * Nothing else may set this. Part-Time computes what is owed and reports it; the
 * assertion that money actually moved belongs to whoever moved it.
 */
export async function markPaidForContract(
  contractId: string,
  actor: AuditActor,
  reason: CommitmentReason = "TASK_PAY"
) {
  const c = await prisma.commitment.findUnique({
    where: { contractId_reason: { contractId, reason } },
  });
  if (!c) return null;
  if (!canTransitionCommitment(c.status, "PAID")) return c;

  const updated = await prisma.commitment.update({
    where: { id: c.id },
    data: { status: "PAID", paidAt: new Date() },
  });
  await prisma.auditLog.create({
    data: auditData(actor, "commitment.paid", "Commitment", c.id, {
      contractId,
      amount: c.amount,
    }),
  });
  return updated;
}

/** The work fell through. Nothing is owed, and the ring-fence comes off. */
export async function cancelForContract(
  contractId: string,
  actor: AuditActor,
  note?: string,
  reason: CommitmentReason = "TASK_PAY"
) {
  const c = await prisma.commitment.findUnique({
    where: { contractId_reason: { contractId, reason } },
  });
  if (!c) return null;
  if (!canTransitionCommitment(c.status, "CANCELLED")) return c;

  const updated = await prisma.commitment.update({
    where: { id: c.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), note: note ?? c.note },
  });
  await prisma.auditLog.create({
    data: auditData(actor, "commitment.cancelled", "Commitment", c.id, { contractId, note }),
  });
  return updated;
}

/**
 * What a task promises, if it can be known up front.
 *
 * FIXED work has a budget. HOURLY work does not have an amount until somebody
 * says how many hours, so it returns null rather than a guess.
 */
export function committableAmount(task: {
  payModel: string;
  budget?: number | null;
  rate?: number | null;
}): number | null {
  if (task.payModel === "FIXED") return task.budget ?? null;
  return null;
}

/** What is currently ring-fenced for one worker, and what has been approved. */
export async function commitmentSummary(workerId: string) {
  const rows = await prisma.commitment.findMany({
    where: { workerId, status: { in: ["COMMITTED", "RELEASED"] } },
    select: { status: true, amount: true },
  });
  let setAside = 0;
  let approved = 0;
  // Hourly commitments with no figure yet are counted separately rather than as
  // zero: "0 set aside" and "an amount nobody has worked out yet" are different
  // things to tell a worker.
  let pendingAmount = 0;
  for (const r of rows) {
    if (r.amount == null) {
      pendingAmount += 1;
      continue;
    }
    if (r.status === "COMMITTED") setAside += r.amount;
    else approved += r.amount;
  }
  return { setAside, approved, awaitingAmount: pendingAmount };
}
