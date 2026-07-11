import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";
import { notifyWorker } from "../services/push";

const router = Router();
export const adminRouter = Router();

const ENTITY_TYPES = ["PAYMENT", "TIMESHEET"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

/** Fetch the underlying entity and verify it belongs to this worker. */
async function resolveEntity(
  type: EntityType,
  entityId: string,
  workerId: string
): Promise<{ title: string; gross?: number; net?: number } | null> {
  if (type === "PAYMENT") {
    const p = await prisma.payment.findUnique({
      where: { id: entityId },
      include: { task: true },
    });
    if (!p || p.workerId !== workerId) return null;
    return { title: p.task.title, gross: p.gross, net: p.net };
  } else {
    const t = await prisma.timesheet.findUnique({
      where: { id: entityId },
      include: { task: true },
    });
    if (!t || t.workerId !== workerId) return null;
    return { title: t.task.title };
  }
}

/** Fetch the underlying entity by id only (no worker ownership check — for admin). */
async function resolveEntityAdmin(
  type: EntityType,
  entityId: string
): Promise<{ title: string; gross?: number; net?: number } | null> {
  if (type === "PAYMENT") {
    const p = await prisma.payment.findUnique({
      where: { id: entityId },
      include: { task: true },
    });
    if (!p) return null;
    return { title: p.task.title, gross: p.gross, net: p.net };
  } else {
    const t = await prisma.timesheet.findUnique({
      where: { id: entityId },
      include: { task: true },
    });
    if (!t) return null;
    return { title: t.task.title };
  }
}

// ─── Admin routes (/api/disputes) ───────────────────────────────────────────

// GET /api/disputes?status=OPEN — list all disputes with worker + entity info.
adminRouter.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN", "TASK_MANAGER"),
  async (req: AuthedRequest, res: Response) => {
    const { status } = req.query;
    const where =
      status && typeof status === "string" && status !== "ALL"
        ? { status }
        : {};
    const disputes = await prisma.dispute.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { worker: { select: { id: true, name: true } } },
    });
    const enriched = await Promise.all(
      disputes.map(async (d) => {
        const entity = await resolveEntityAdmin(d.entityType as EntityType, d.entityId);
        return { ...d, entity };
      })
    );
    res.json(enriched);
  }
);

// PATCH /api/disputes/:id — resolve (RESOLVED) or close (CLOSED) a dispute.
// body: { status: "RESOLVED"|"CLOSED", resolution?: string }
adminRouter.patch(
  "/:id",
  requireAuth,
  requireRole("SUPER_ADMIN", "TASK_MANAGER"),
  async (req: AuthedRequest, res: Response) => {
    const { status, resolution } = req.body || {};
    if (status !== "RESOLVED" && status !== "CLOSED") {
      return res
        .status(400)
        .json({ error: 'status must be "RESOLVED" or "CLOSED"' });
    }

    const existing = await prisma.dispute.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: "Dispute not found" });
    if (existing.status !== "OPEN") {
      return res.status(409).json({ error: "Dispute is already closed" });
    }

    const updated = await prisma.dispute.update({
      where: { id: req.params.id },
      data: {
        status,
        resolution: String(resolution ?? "").trim() || null,
      },
      include: { worker: { select: { id: true, name: true } } },
    });

    // Un-flag the underlying entity so it can continue its normal lifecycle.
    if (existing.entityType === "PAYMENT") {
      await prisma.payment.update({
        where: { id: existing.entityId },
        data: { status: "APPROVED" },
      });
    } else {
      await prisma.timesheet.update({
        where: { id: existing.entityId },
        data: { status: "APPROVED" },
      });
    }

    void notifyWorker(
      prisma,
      updated.workerId,
      status === "RESOLVED" ? "Dispute resolved" : "Dispute closed",
      updated.resolution
        ? `Update on your dispute: ${updated.resolution}`
        : "There's an update on the dispute you raised. Check the app for details.",
      { screen: "disputes" },
      existing.entityType === "PAYMENT" ? "notifPay" : "notifTasks"
    );

    res.json(updated);
  }
);

// POST /api/me/disputes — raise a dispute on a payment or timesheet.
// body: { entityType: "PAYMENT"|"TIMESHEET", entityId: string, reason: string }
router.post("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const workerId = req.user!.id;
  const { entityType, entityId, reason } = req.body || {};

  if (!ENTITY_TYPES.includes(entityType)) {
    return res.status(400).json({ error: 'entityType must be "PAYMENT" or "TIMESHEET"' });
  }
  if (!entityId || typeof entityId !== "string") {
    return res.status(400).json({ error: "entityId is required" });
  }
  const r = String(reason ?? "").trim();
  if (r.length < 10) {
    return res.status(400).json({ error: "Please describe the issue (at least 10 characters)" });
  }

  const entity = await resolveEntity(entityType as EntityType, entityId, workerId);
  if (!entity) {
    return res.status(404).json({ error: "Record not found or does not belong to you" });
  }

  // Guard: only one open dispute per entity.
  const existing = await prisma.dispute.findFirst({
    where: { workerId, entityId, status: "OPEN" },
  });
  if (existing) {
    return res.status(409).json({ error: "An open dispute already exists for this item" });
  }

  // Mark the underlying entity as DISPUTED.
  if (entityType === "PAYMENT") {
    await prisma.payment.update({ where: { id: entityId }, data: { status: "DISPUTED" } });
  } else {
    await prisma.timesheet.update({ where: { id: entityId }, data: { status: "DISPUTED" } });
  }

  const dispute = await prisma.dispute.create({
    data: { workerId, entityType, entityId, reason: r },
  });

  res.status(201).json({
    ...dispute,
    entity: { title: entity.title, gross: entity.gross, net: entity.net },
  });
});

// GET /api/me/disputes — worker's disputes with entity summary.
router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const workerId = req.user!.id;
  const disputes = await prisma.dispute.findMany({
    where: { workerId },
    orderBy: { createdAt: "desc" },
  });

  // Enrich each with entity title.
  const enriched = await Promise.all(
    disputes.map(async (d) => {
      const entity = await resolveEntity(d.entityType as EntityType, d.entityId, workerId);
      return { ...d, entity: entity ? { title: entity.title } : null };
    })
  );

  res.json(enriched);
});

export default router;
