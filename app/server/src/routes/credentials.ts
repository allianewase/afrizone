/**
 * The credential review desk: the queue an admin works, and the decisions they
 * record on it.
 *
 * This is the operational heart of the talent database. Everything the gate
 * later relies on gets its authority here, from a person having looked at a
 * document - which is precisely why the endpoints below are shaped around
 * making that person's job fast and their decision reversible, rather than
 * around the data model.
 */
import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";
import { isCredentialValid, isCredentialExpiring, tiersToArray } from "../types";
import { writeAudit, userActor } from "../util/audit";
import { notifyWorker } from "../services/push";

const router = Router();

// Reviewing a credential is the same competence as reviewing identity, so it
// carries the same roles as the KYC decision in routes/workers.ts.
const REVIEWERS = ["SUPER_ADMIN", "HR_ADMIN"] as const;
// Reading a profile is broader: a task manager choosing between applicants
// needs to see it, and it grants no power to change anything.
const PROFILE_READERS = ["SUPER_ADMIN", "HR_ADMIN", "TASK_MANAGER"] as const;

/**
 * The reasons a credential can be turned down.
 *
 * A closed list because THE TEXT REACHES THE WORKER VERBATIM. Free-typed
 * reasons in a queue worked at speed produce curt, ambiguous messages that the
 * worker cannot act on - and this message is the only thing standing between
 * them and re-submitting the same unusable photo. "other" exists for the case
 * the list does not cover, and is the one branch that requires the reviewer to
 * write something.
 */
export const REJECTION_REASONS: Record<string, string> = {
  blurry: "We could not read this clearly. Please send a sharper photo or scan.",
  expired: "This document has expired. Please send a current one.",
  name_mismatch: "The name on this document does not match your Afrizone profile.",
  wrong_type: "This is not the document we asked for. Please check and send the right one.",
  not_genuine: "We could not confirm this document is genuine.",
  other: "",
};

const CREDENTIAL_INCLUDE = {
  credentialType: true,
  worker: {
    select: { id: true, name: true, email: true, phone: true, kycStatus: true, tiers: true },
  },
  document: { select: { id: true, filename: true, mimeType: true, originalName: true } },
  reviewedBy: { select: { id: true, name: true } },
} as const;

function shape(c: any, now = new Date()) {
  const valid = isCredentialValid(c, now);
  return {
    id: c.id,
    title: c.title,
    issuer: c.issuer,
    referenceNumber: c.referenceNumber,
    issuedAt: c.issuedAt,
    expiresAt: c.expiresAt,
    status: c.status,
    // VERIFIED-but-lapsed reads as EXPIRED here exactly as it does for the
    // worker. Same derivation, one place, so the two views cannot disagree.
    state:
      c.credentialType.reviewMode === "SELF_DECLARED"
        ? "SELF_DECLARED"
        : c.status === "VERIFIED"
          ? valid
            ? "VERIFIED"
            : "EXPIRED"
          : c.status,
    valid,
    expiringSoon: isCredentialExpiring(c, 30, now),
    rejectionReason: c.rejectionReason,
    reviewedAt: c.reviewedAt,
    reviewedBy: c.reviewedBy,
    createdAt: c.createdAt,
    credentialType: c.credentialType,
    worker: c.worker ? { ...c.worker, tiers: tiersToArray(c.worker.tiers) } : undefined,
    document: c.document,
  };
}

/**
 * GET /api/credentials?filter=pending|verified|rejected|expiring
 *
 * SELF_DECLARED types are excluded from every filter. Nobody is going to review
 * them, so leaving them in the queue would grow a permanent backlog of work
 * that must never be done - the fastest way to make a review queue useless.
 */
router.get("/", requireAuth, requireRole(...REVIEWERS), async (req: AuthedRequest, res: Response) => {
  const filter = String(req.query.filter ?? "pending");
  const now = new Date();

  const reviewable = { credentialType: { reviewMode: "ADMIN_REVIEW" } };

  if (filter === "expiring") {
    // Verified, in date, but lapsing within 30 days. Filtered in SQL on the
    // date rather than on a stored status, because there is no stored status
    // to filter on - see the Credential model.
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const rows = await prisma.credential.findMany({
      where: {
        ...reviewable,
        status: "VERIFIED",
        expiresAt: { gt: now, lte: soon },
      },
      include: CREDENTIAL_INCLUDE,
      orderBy: { expiresAt: "asc" },
      take: 200,
    });
    return res.json(rows.map((r) => shape(r, now)));
  }

  const statusByFilter: Record<string, string> = {
    pending: "PENDING",
    verified: "VERIFIED",
    rejected: "REJECTED",
    revoked: "REVOKED",
  };
  const status = statusByFilter[filter];
  if (!status) {
    return res.status(400).json({ error: "filter must be pending, verified, rejected, revoked or expiring" });
  }

  const rows = await prisma.credential.findMany({
    where: { ...reviewable, status },
    include: CREDENTIAL_INCLUDE,
    // Pending is worked OLDEST FIRST: the person who has waited longest is the
    // one whose income the wait is costing. Everything else reads newest-first.
    orderBy: status === "PENDING" ? { createdAt: "asc" } : { reviewedAt: "desc" },
    take: 200,
  });
  res.json(rows.map((r) => shape(r, now)));
});

// GET /api/credentials/pending-count → the nav badge.
router.get(
  "/pending-count",
  requireAuth,
  requireRole(...REVIEWERS),
  async (_req: AuthedRequest, res: Response) => {
    const pending = await prisma.credential.count({
      where: { status: "PENDING", credentialType: { reviewMode: "ADMIN_REVIEW" } },
    });
    res.json({ pending });
  }
);

/**
 * GET /api/credentials/:id → everything the reviewer needs on one screen.
 *
 * Including two things they would otherwise have to go and look up, and
 * therefore would not:
 *
 *   - the worker's OTHER credentials, because a pattern across several is
 *     often what makes a single doubtful one obvious;
 *   - whether this reference number is already VERIFIED on a DIFFERENT worker,
 *     which is the signature of a document being passed around. Surfaced as a
 *     warning, never as an automatic refusal - two people can legitimately
 *     share a reference on some document types, and a machine is not the right
 *     thing to be making that call.
 */
router.get("/:id", requireAuth, requireRole(...REVIEWERS), async (req: AuthedRequest, res: Response) => {
  const credential = await prisma.credential.findUnique({
    where: { id: req.params.id },
    include: CREDENTIAL_INCLUDE,
  });
  if (!credential) return res.status(404).json({ error: "Credential not found" });

  const now = new Date();
  const others = await prisma.credential.findMany({
    where: { workerId: credential.workerId, id: { not: credential.id } },
    include: { credentialType: true },
    orderBy: { createdAt: "desc" },
  });

  let duplicateOf: { workerId: string; workerName: string } | null = null;
  if (credential.referenceNumber) {
    const clash = await prisma.credential.findFirst({
      where: {
        referenceNumber: credential.referenceNumber,
        credentialTypeId: credential.credentialTypeId,
        status: "VERIFIED",
        workerId: { not: credential.workerId },
      },
      include: { worker: { select: { id: true, name: true } } },
    });
    if (clash) duplicateOf = { workerId: clash.worker.id, workerName: clash.worker.name };
  }

  res.json({
    ...shape(credential, now),
    otherCredentials: others.map((o) => shape({ ...o, worker: undefined }, now)),
    duplicateOf,
  });
});

/**
 * POST /api/credentials/:id/review
 * body {decision: "APPROVE"|"REJECT"|"REVOKE", reasonCode?, reasonText?, corrections?}
 *
 * THE REVIEWER CAN CORRECT THE FIELDS BEFORE APPROVING. This is not a
 * convenience. The worker typed their details on a phone, from a document they
 * were holding; the reviewer is looking at the actual document. Forcing a
 * reject-and-resubmit round trip over a mistyped digit costs the worker days of
 * work and the desk a second review, and the correct value is already on the
 * reviewer's screen.
 */
router.post(
  "/:id/review",
  requireAuth,
  requireRole(...REVIEWERS),
  async (req: AuthedRequest, res: Response) => {
    const reviewerId = req.user!.id;
    const b = req.body || {};
    const decision = String(b.decision ?? "");
    if (!["APPROVE", "REJECT", "REVOKE"].includes(decision)) {
      return res.status(400).json({ error: "decision must be APPROVE, REJECT or REVOKE" });
    }

    const credential = await prisma.credential.findUnique({
      where: { id: req.params.id },
      include: { credentialType: true },
    });
    if (!credential) return res.status(404).json({ error: "Credential not found" });
    if (credential.credentialType.reviewMode === "SELF_DECLARED") {
      return res.status(400).json({ error: "This credential type is not reviewed" });
    }

    const now = new Date();
    const data: Record<string, unknown> = {
      reviewedById: reviewerId,
      reviewedAt: now,
    };

    if (decision === "APPROVE") {
      const c = b.corrections || {};
      if (c.title !== undefined) {
        const t = String(c.title).trim();
        if (!t) return res.status(400).json({ error: "title cannot be empty" });
        data.title = t;
      }
      if (c.issuer !== undefined) data.issuer = c.issuer ? String(c.issuer).trim() : null;
      if (c.referenceNumber !== undefined) {
        data.referenceNumber = c.referenceNumber ? String(c.referenceNumber).trim() : null;
      }
      for (const field of ["issuedAt", "expiresAt"] as const) {
        if (c[field] === undefined) continue;
        if (c[field] === null || c[field] === "") {
          data[field] = null;
          continue;
        }
        const d = new Date(String(c[field]));
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ error: `${field} is not a valid date` });
        }
        data[field] = d;
      }

      const expiresAt = (data.expiresAt as Date | null | undefined) ?? credential.expiresAt;
      const issuedAt = (data.issuedAt as Date | null | undefined) ?? credential.issuedAt;
      if (issuedAt && expiresAt && expiresAt.getTime() <= issuedAt.getTime()) {
        return res.status(400).json({ error: "The expiry date must be after the issue date" });
      }
      if (credential.credentialType.requiresExpiry && !expiresAt) {
        return res.status(400).json({ error: `${credential.credentialType.name} needs an expiry date` });
      }
      // Approving something already past its date would create a credential
      // that is VERIFIED and instantly invalid - confusing for everyone and
      // never what the reviewer means.
      if (expiresAt && expiresAt.getTime() <= now.getTime()) {
        return res.status(400).json({
          error: "That expiry date has already passed. Reject it as expired instead.",
        });
      }

      data.status = "VERIFIED";
      data.rejectionReason = null;
    } else {
      const code = String(b.reasonCode ?? "");
      if (!(code in REJECTION_REASONS)) {
        return res.status(400).json({
          error: `reasonCode must be one of ${Object.keys(REJECTION_REASONS).join(", ")}`,
        });
      }
      const custom = String(b.reasonText ?? "").trim();
      if (code === "other" && custom.length < 10) {
        return res.status(400).json({ error: "Please write what was wrong (at least 10 characters)" });
      }
      data.status = decision === "REJECT" ? "REJECTED" : "REVOKED";
      data.rejectionReason = code === "other" ? custom : REJECTION_REASONS[code];
    }

    const updated = await prisma.credential.update({
      where: { id: credential.id },
      data,
      include: CREDENTIAL_INCLUDE,
    });

    await writeAudit(userActor(reviewerId), `CREDENTIAL_${decision}`, "Credential", credential.id, {
      credentialType: credential.credentialType.slug,
      previousStatus: credential.status,
      corrections: decision === "APPROVE" ? Object.keys(b.corrections || {}) : undefined,
      reasonCode: decision === "APPROVE" ? undefined : b.reasonCode,
    });

    const name = updated.credentialType.name;
    await notifyWorker(
      prisma,
      credential.workerId,
      decision === "APPROVE" ? `${name} verified ✅` : `${name} not accepted`,
      decision === "APPROVE"
        ? `We have checked your ${name.toLowerCase()}. It now counts towards the work you can take on.`
        : String(data.rejectionReason),
      { screen: "credentials" },
      "notifTasks"
    );

    res.json(shape(updated));
  }
);

export default router;
