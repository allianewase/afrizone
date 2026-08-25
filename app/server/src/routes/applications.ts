import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";
import { tiersToArray } from "../types";
import { notifyWorker } from "../services/push";
import { userActor, writeAudit } from "../util/audit";
import {
  blockingBlockers,
  decide,
  isEnforcing,
  loadTaskRequirements,
  loadWorkerProfile,
  snapshot,
} from "../services/eligibility";

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

/**
 * POST /api/applications - worker applies for a task. Acting worker = req.user.id.
 *
 * Guards: task exists and is OPEN, deadline not passed, no duplicate, and the
 * worker meets the task requirements.
 *
 * The hand-rolled tier check that used to live here is gone. It is now one
 * blocker among several, produced by services/eligibility, so this endpoint and
 * the card the worker tapped cannot drift apart. A card promising "you qualify"
 * and a server that then refuses is the one failure this feature must not have.
 */
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

  // Duplicate check BEFORE the requirements check. A worker who already applied
  // and has since let a credential lapse should be told they already applied,
  // not handed a list of things to fix for an application they cannot make a
  // second time anyway.
  const duplicate = await prisma.application.findFirst({ where: { taskId: task.id, workerId } });
  if (duplicate) return res.status(409).json({ error: "You have already applied to this task" });

  const [profile, requirements, enforcing] = await Promise.all([
    loadWorkerProfile(prisma, workerId),
    loadTaskRequirements(prisma, [task]),
    isEnforcing(prisma),
  ]);
  if (!profile) return res.status(404).json({ error: "Worker not found" });

  const reqs = requirements.get(task.id)!;
  const eligibility = decide(profile, reqs);
  const blocking = blockingBlockers(eligibility.blockers, enforcing);
  if (blocking.length > 0) {
    return res.status(400).json({
      // The first blocker is the headline the app shows; the array is what it
      // renders as a checklist, each row carrying a route to fix that one.
      error: blocking[0].message,
      blockers: blocking,
      eligibility,
    });
  }

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

  // Re-checked at approval, not only at application. Days pass between the two,
  // and a licence that expires in between is exactly the case this gate exists
  // for: the worker was eligible when they applied and is not now.
  const now = new Date();
  const [profile, requirements, enforcing] = await Promise.all([
    loadWorkerProfile(prisma, app.workerId, now),
    loadTaskRequirements(prisma, [app.task]),
    isEnforcing(prisma),
  ]);
  if (!profile) return res.status(404).json({ error: "Worker not found" });
  const reqs = requirements.get(app.taskId)!;
  const eligibility = decide(profile, reqs);
  const blocking = blockingBlockers(eligibility.blockers, enforcing);

  // An admin may still approve someone the gate refuses. They can see context
  // the rules cannot, and a platform where a human can never override is a
  // platform that strands people. But they have to say so explicitly, and the
  // override is audited: refusing silently and refusing unoverridably are both
  // worse than refusing loudly.
  const override = req.body?.override === true;
  if (blocking.length > 0 && !override) {
    return res.status(400).json({
      error: `${profile.name} no longer meets the requirements for this task`,
      blockers: blocking,
      eligibility,
      requiresOverride: true,
    });
  }

  const updated = await prisma.application.update({
    where: { id: app.id },
    data: {
      status: "APPROVED",
      reason: null,
      // What was true at approval, frozen. Credentials expire and skills can be
      // un-declared, so "were they eligible at the time?" is unanswerable from
      // current state later - and that is exactly the question asked when
      // something goes wrong on a job weeks afterwards.
      eligibilitySnapshot: snapshot(profile, reqs, eligibility, now),
    },
  });

  if (blocking.length > 0) {
    await writeAudit(userActor(req.user!.id), "application.approved.override", "Application", app.id, {
      workerId: app.workerId,
      taskId: app.taskId,
      blockers: blocking.map((b) => ({ code: b.code, ref: b.ref })),
    });
  }

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
  await notifyWorker(
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
    await notifyWorker(
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
