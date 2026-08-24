import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";
import { tiersToArray } from "../types";
import { notifyWorker } from "../services/push";

const router = Router();

// GET /api/applications?status=APPLIED → joined with worker + task
// Admin-only: the worker's own view is GET /api/me/applications, already scoped.
router.get("/", requireAuth, requireRole("SUPER_ADMIN", "TASK_MANAGER"), async (req: AuthedRequest, res: Response) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const apps = await prisma.application.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: { worker: true, task: true },
  });
  res.json(
    apps.map((a) => ({
      id: a.id,
      taskId: a.taskId,
      workerId: a.workerId,
      pitch: a.pitch,
      status: a.status,
      reason: a.reason,
      createdAt: a.createdAt,
      worker: {
        id: a.worker.id,
        name: a.worker.name,
        tiers: tiersToArray(a.worker.tiers),
        kycStatus: a.worker.kycStatus,
        rating: a.worker.rating,
      },
      task: { id: a.task.id, title: a.task.title },
    }))
  );
});

// POST /api/applications → worker apply for a task. Acting worker = req.user.id.
// Guards: task exists & OPEN, deadline not passed, worker tier matches, no duplicate.
router.post("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const workerId = req.user!.id;
  const { taskId, pitch } = req.body || {};
  if (!taskId) return res.status(400).json({ error: "taskId is required" });

  const task = await prisma.task.findUnique({ where: { id: String(taskId) } });
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.status !== "OPEN") return res.status(400).json({ error: "Task is not open for applications" });
  if (new Date(task.deadline).getTime() < Date.now()) {
    return res.status(400).json({ error: "Application deadline has passed" });
  }

  const worker = await prisma.user.findUnique({ where: { id: workerId } });
  if (!worker) return res.status(404).json({ error: "Worker not found" });
  const workerTiers = tiersToArray(worker.tiers);
  if (!workerTiers.includes(task.tier as any)) {
    return res.status(400).json({ error: `Your tiers do not include ${task.tier}` });
  }

  const duplicate = await prisma.application.findFirst({ where: { taskId: task.id, workerId } });
  if (duplicate) return res.status(409).json({ error: "You have already applied to this task" });

  const created = await prisma.application.create({
    data: { taskId: task.id, workerId, pitch: pitch ? String(pitch) : null, status: "APPLIED" },
  });
  res.status(201).json(created);
});

// POST /api/applications/:id/approve → bump task filled; if full → task FILLED
// Admin-only. Approving flips the task to FILLED and auto-creates a signed
// contract, so an unguarded version let a worker onboard themselves onto any
// task by approving their own application.
router.post("/:id/approve", requireAuth, requireRole("SUPER_ADMIN", "TASK_MANAGER"), async (req: AuthedRequest, res: Response) => {
  const app = await prisma.application.findUnique({ where: { id: req.params.id }, include: { task: true } });
  if (!app) return res.status(404).json({ error: "Application not found" });
  if (app.status === "APPROVED") return res.status(400).json({ error: "Application already approved" });

  const updated = await prisma.application.update({
    where: { id: app.id },
    data: { status: "APPROVED", reason: null },
  });

  // Recompute filled count and flip task to FILLED when slots are full.
  const filledCount = await prisma.application.count({ where: { taskId: app.taskId, status: "APPROVED" } });
  if (filledCount >= app.task.slots && app.task.status === "OPEN") {
    await prisma.task.update({ where: { id: app.taskId }, data: { status: "FILLED" } });
  }

  // v3 tie-in: auto-create a PENDING_SIGNATURE contract for this worker+task if none exists.
  const existingContract = await prisma.contract.findFirst({
    where: { taskId: app.taskId, workerId: app.workerId },
  });
  if (!existingContract) {
    await prisma.contract.create({
      data: { taskId: app.taskId, workerId: app.workerId, status: "PENDING_SIGNATURE" },
    });
  }

  // Notify worker: approved + contract ready
  void notifyWorker(
    prisma,
    app.workerId,
    "Application approved 🎉",
    `You've been selected for "${app.task.title}". A contract is ready to sign.`,
    { screen: "tasks" },
    "notifTasks"
  );

  res.json(updated);
});

// POST /api/applications/:id/reject → body {reason}
router.post("/:id/reject", requireAuth, requireRole("SUPER_ADMIN", "TASK_MANAGER"), async (req: AuthedRequest, res: Response) => {
  const { reason } = req.body || {};
  const app = await prisma.application.findUnique({ where: { id: req.params.id } });
  if (!app) return res.status(404).json({ error: "Application not found" });

  const appWithTask = await prisma.application.findUnique({
    where: { id: req.params.id },
    include: { task: true },
  });

  const updated = await prisma.application.update({
    where: { id: app.id },
    data: { status: "REJECTED", reason: reason ?? null },
  });

  // Notify worker: not selected this time
  if (appWithTask) {
    void notifyWorker(
      prisma,
      app.workerId,
      "Application update",
      `Your application for "${appWithTask.task.title}" was not selected this time. Keep applying!`,
      { screen: "tasks" },
      "notifTasks"
    );
  }

  res.json(updated);
});

export default router;
