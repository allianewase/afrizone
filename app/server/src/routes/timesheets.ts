import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";
import { requireAssignedTask } from "../util/assignment";
import { tiersToArray } from "../types";
import { computeWht } from "../util/tax";

const router = Router();

const SLA_HOURS = 48; // 24–48h SLA per design spec; use 48h ceiling.

// GET /api/timesheets?status=SUBMITTED → joined w/ worker + task + slaHoursLeft
// Admin-only: the worker's own view is GET /api/me/timesheets, already scoped.
router.get("/", requireAuth, requireRole("SUPER_ADMIN", "TASK_MANAGER"), async (req: AuthedRequest, res: Response) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const sheets = await prisma.timesheet.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: { worker: true, task: true },
  });
  const now = Date.now();
  res.json(
    sheets.map((t) => {
      const elapsedH = (now - new Date(t.createdAt).getTime()) / 3_600_000;
      const slaHoursLeft = Math.max(0, Math.round(SLA_HOURS - elapsedH));
      return {
        id: t.id,
        taskId: t.taskId,
        workerId: t.workerId,
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
        hours: t.hours,
        status: t.status,
        gpsNote: t.gpsNote,
        createdAt: t.createdAt,
        slaHoursLeft,
        worker: {
          id: t.worker.id,
          name: t.worker.name,
          tiers: tiersToArray(t.worker.tiers),
          kycStatus: t.worker.kycStatus,
          rating: t.worker.rating,
        },
        task: { id: t.task.id, title: t.task.title, payModel: t.task.payModel, rate: t.task.rate, budget: t.task.budget },
      };
    })
  );
});

// POST /api/timesheets → worker submits a timesheet (status SUBMITTED).
// Acting worker = req.user.id; never trust a workerId from the body.
router.post("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const workerId = req.user!.id;
  const { taskId, periodStart, periodEnd, hours } = req.body || {};
  if (!taskId || !periodStart || !periodEnd || hours == null) {
    return res.status(400).json({ error: "taskId, periodStart, periodEnd and hours are required" });
  }
  const hoursNum = Number(hours);
  if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
    return res.status(400).json({ error: "hours must be a positive number" });
  }
  // Hours can only be billed against a task this worker was actually given.
  // Approving a timesheet mints a Payment, so an unassigned row reaching the
  // admin queue is a payout request that looks exactly like a real one.
  const assignment = await requireAssignedTask(workerId, taskId);
  if (!assignment.ok) return res.status(assignment.status).json({ error: assignment.error });
  const { task } = assignment;

  const created = await prisma.timesheet.create({
    data: {
      taskId: task.id,
      workerId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      hours: hoursNum,
      status: "SUBMITTED",
    },
  });
  res.status(201).json(created);
});

// POST /api/timesheets/:id/approve → creates a Payment (status APPROVED),
// gross = hours*task.rate (HOURLY) or task.budget (FIXED).
// Admin-only. This is the money-minting endpoint: approving a timesheet
// creates the Payment row (gross = hours * rate). A worker submits their own
// hours, so letting them also approve was a complete self-serve payout chain.
router.post("/:id/approve", requireAuth, requireRole("SUPER_ADMIN", "TASK_MANAGER"), async (req: AuthedRequest, res: Response) => {
  const sheet = await prisma.timesheet.findUnique({ where: { id: req.params.id }, include: { task: true } });
  if (!sheet) return res.status(404).json({ error: "Timesheet not found" });
  if (sheet.status === "APPROVED") return res.status(400).json({ error: "Timesheet already approved" });

  const task = sheet.task;
  let gross: number;
  if (task.payModel === "FIXED") {
    gross = task.budget ?? 0;
  } else {
    gross = Math.round(sheet.hours * (task.rate ?? 0));
  }
  const whtRate = 0.05;
  const { whtAmount, net } = computeWht(gross, whtRate);

  const result = await prisma.$transaction(async (tx) => {
    const updatedSheet = await tx.timesheet.update({
      where: { id: sheet.id },
      data: { status: "APPROVED" },
    });
    const payment = await tx.payment.create({
      data: {
        workerId: sheet.workerId,
        taskId: sheet.taskId,
        gross,
        whtRate,
        whtAmount,
        net,
        status: "APPROVED",
      },
    });
    return { updatedSheet, payment };
  });

  res.json({ ...result.updatedSheet, payment: result.payment });
});

// POST /api/timesheets/:id/dispute → body {reason}
router.post("/:id/dispute", requireAuth, requireRole("SUPER_ADMIN", "TASK_MANAGER"), async (req: AuthedRequest, res: Response) => {
  const { reason } = req.body || {};
  const sheet = await prisma.timesheet.findUnique({ where: { id: req.params.id } });
  if (!sheet) return res.status(404).json({ error: "Timesheet not found" });

  const updated = await prisma.timesheet.update({
    where: { id: sheet.id },
    data: { status: "DISPUTED", gpsNote: reason ? `DISPUTE: ${reason}` : sheet.gpsNote },
  });
  res.json(updated);
});

export default router;
