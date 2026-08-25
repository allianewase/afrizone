import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest, publicUser } from "../auth";
import { tiersToArray } from "../types";
import { writeAudit, userActor } from "../util/audit";
import { resolveUrl } from "../services/storage";
import { notifyWorker } from "../services/push";

const router = Router();

// Derived wallet for a worker (matches GET /me/wallet semantics).
function wallet(
  payments: { net: number; status: string }[],
  withdrawals: { amount: number; status: string }[]
) {
  const pending = payments
    .filter((p) => p.status === "PENDING" || p.status === "APPROVED")
    .reduce((s, p) => s + p.net, 0);
  const released = payments.filter((p) => p.status === "RELEASED").reduce((s, p) => s + p.net, 0);
  const withdrawn = withdrawals
    .filter((w) => w.status !== "FAILED")
    .reduce((s, w) => s + w.amount, 0);
  return { pending, available: released - withdrawn, withdrawn };
}

// GET /api/workers → users where role=WORKER
// Admin-only: the full worker directory. Guarded per-handler to match the
// existing style in this file (the KYC-review routes below already do).
router.get("/", requireAuth, requireRole("SUPER_ADMIN", "HR_ADMIN", "TASK_MANAGER"), async (_req: AuthedRequest, res: Response) => {
  const workers = await prisma.user.findMany({
    where: { role: "WORKER" },
    orderBy: { name: "asc" },
  });
  res.json(
    workers.map((w) => ({
      id: w.id,
      name: w.name,
      email: w.email,
      tiers: tiersToArray(w.tiers),
      kycStatus: w.kycStatus,
      completedCount: w.completedCount,
      rating: w.rating,
    }))
  );
});

// GET /api/workers/:id → full worker + applications/payments summary + wallet
// Admin-only: returns the full user row (phone, TIN, bank details) plus every
// application, payment and a derived wallet for that worker.
router.get("/:id", requireAuth, requireRole("SUPER_ADMIN", "HR_ADMIN", "TASK_MANAGER"), async (req: AuthedRequest, res: Response) => {
  const worker = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      applications: { include: { task: true }, orderBy: { createdAt: "desc" } },
      payments: { include: { task: true }, orderBy: { createdAt: "desc" } },
      withdrawals: true,
    },
  });
  if (!worker || worker.role !== "WORKER") return res.status(404).json({ error: "Worker not found" });

  res.json({
    ...publicUser(worker),
    applications: worker.applications.map((a) => ({
      id: a.id,
      taskId: a.taskId,
      status: a.status,
      pitch: a.pitch,
      reason: a.reason,
      createdAt: a.createdAt,
      task: { id: a.task.id, title: a.task.title },
    })),
    payments: worker.payments.map((p) => ({
      id: p.id,
      taskId: p.taskId,
      gross: p.gross,
      whtRate: p.whtRate,
      whtAmount: p.whtAmount,
      net: p.net,
      status: p.status,
      createdAt: p.createdAt,
      task: { id: p.task.id, title: p.task.title },
    })),
    wallet: wallet(worker.payments, worker.withdrawals),
  });
});

// POST /api/workers/:id/kyc → body {decision:"TIER_APPROVED"|"REJECTED"}
// KYC overrides are Super Admin per design spec; HR_ADMIN also allowed to review.
router.post(
  "/:id/kyc",
  requireAuth,
  requireRole("SUPER_ADMIN", "HR_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    const { decision } = req.body || {};
    if (decision !== "TIER_APPROVED" && decision !== "REJECTED") {
      return res.status(400).json({ error: "decision must be 'TIER_APPROVED' or 'REJECTED'" });
    }
    const worker = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!worker || worker.role !== "WORKER") return res.status(404).json({ error: "Worker not found" });

    const updated = await prisma.user.update({
      where: { id: worker.id },
      data: { kycStatus: decision },
    });
    await writeAudit(userActor(req.user!.id), "KYC_DECISION", "User", worker.id, { decision });

    await notifyWorker(
      prisma,
      worker.id,
      decision === "TIER_APPROVED" ? "Identity verified ✅" : "Verification not approved",
      decision === "TIER_APPROVED"
        ? "Your identity has been verified. You can now apply to tasks."
        : "Your verification wasn't approved. Check the app for details and re-verify.",
      { screen: "kyc" },
      "notifTasks"
    );

    res.json(publicUser(updated));
  }
);

// GET /api/workers/:id/kyc/documents: admin view of a worker's uploaded KYC docs.
router.get(
  "/:id/kyc/documents",
  requireAuth,
  requireRole("SUPER_ADMIN", "HR_ADMIN", "TASK_MANAGER"),
  async (req: AuthedRequest, res: Response) => {
    const worker = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!worker || worker.role !== "WORKER") return res.status(404).json({ error: "Worker not found" });

    const docs = await prisma.kycDocument.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: "asc" },
    });

    const enriched = await Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        docType: d.docType,
        filename: d.filename,
        originalName: d.originalName,
        mimeType: d.mimeType,
        url: await resolveUrl(d.filename),
        createdAt: d.createdAt,
      }))
    );
    res.json(enriched);
  }
);

export default router;
