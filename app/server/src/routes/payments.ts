import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";
import { writeAudit, userActor, auditData } from "../util/audit";
import { notifyWorker, notifyWorkers } from "../services/push";

const router = Router();

// GET /api/payments?status= → joined with worker {id,name} and task {id,title}
// Admin-only: the worker's own view is GET /api/me/transactions and
// GET /api/me/payments/:id, both already scoped to req.user.id.
router.get("/", requireAuth, requireRole("SUPER_ADMIN", "TASK_MANAGER"), async (req: AuthedRequest, res: Response) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const payments = await prisma.payment.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: { worker: true, task: true },
  });
  res.json(
    payments.map((p) => ({
      id: p.id,
      workerId: p.workerId,
      taskId: p.taskId,
      gross: p.gross,
      whtRate: p.whtRate,
      whtAmount: p.whtAmount,
      net: p.net,
      status: p.status,
      createdAt: p.createdAt,
      worker: { id: p.worker.id, name: p.worker.name },
      task: { id: p.task.id, title: p.task.title },
    }))
  );
});

// POST /api/payments/:id/release → sets RELEASED, writes AuditLog
router.post("/:id/release", requireAuth, requireRole("SUPER_ADMIN"), async (req: AuthedRequest, res: Response) => {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  if (payment.status === "RELEASED") return res.status(400).json({ error: "Payment already released" });

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "RELEASED" },
  });
  await writeAudit(userActor(req.user!.id), "PAYMENT_RELEASED", "Payment", payment.id, {
    net: payment.net,
    gross: payment.gross,
    workerId: payment.workerId,
  });

  await notifyWorker(
    prisma,
    payment.workerId,
    "Payment released 💰",
    `₦${payment.net.toLocaleString()} has been added to your wallet.`,
    { screen: "wallet" },
    "notifPay"
  );

  res.json(updated);
});

// POST /api/payments/release-all → releases all APPROVED → {released, totalNet}
router.post("/release-all", requireAuth, requireRole("SUPER_ADMIN"), async (req: AuthedRequest, res: Response) => {
  const approved = await prisma.payment.findMany({ where: { status: "APPROVED" } });
  const totalNet = approved.reduce((sum, p) => sum + p.net, 0);

  await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({ where: { status: "APPROVED" }, data: { status: "RELEASED" } });
    for (const p of approved) {
      // auditData() rather than writeAudit(), so this writes through the
      // transaction's own client instead of a second connection.
      await tx.auditLog.create({
        data: auditData(userActor(req.user!.id), "PAYMENT_RELEASED", "Payment", p.id, {
          net: p.net,
          gross: p.gross,
          workerId: p.workerId,
          batch: true,
        }),
      });
    }
  });

  // Notify each worker whose payment was released
  const workerIds = [...new Set(approved.map((p) => p.workerId))];
  await notifyWorkers(
    prisma,
    workerIds,
    "Payments released 💰",
    "Your earnings have been released to your wallet.",
    { screen: "wallet" },
    "notifPay"
  );

  res.json({ released: approved.length, totalNet });
});

export default router;
