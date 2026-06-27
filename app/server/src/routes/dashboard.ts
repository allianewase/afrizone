import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";

const router = Router();

function ago(date: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

// GET /api/dashboard/stats
router.get("/stats", requireAuth, async (_req: AuthedRequest, res: Response) => {
  const [activeTasks, filledTasks, approvedApps, totalApps, paymentsRows, recentApps] = await Promise.all([
    prisma.task.count({ where: { status: "OPEN" } }),
    prisma.task.count({ where: { status: "FILLED" } }),
    prisma.application.count({ where: { status: "APPROVED" } }),
    prisma.application.count(),
    prisma.payment.findMany(),
    prisma.application.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { worker: true, task: true },
    }),
  ]);

  const totalTasks = await prisma.task.count();
  const fillRate = totalTasks > 0 ? Math.round((filledTasks / totalTasks) * 100) : 0;

  const releasedSpend = paymentsRows
    .filter((p) => p.status === "RELEASED")
    .reduce((s, p) => s + p.net, 0);
  const allNetSpend = paymentsRows.reduce((s, p) => s + p.net, 0);
  const spendThisMonth = releasedSpend > 0 ? releasedSpend : allNetSpend;

  const readyToRelease = paymentsRows.filter((p) => p.status === "APPROVED");
  const readyNet = readyToRelease.reduce((s, p) => s + p.net, 0);

  const urgent: any[] = [];
  if (readyToRelease.length > 0) {
    urgent.push({
      type: "payments",
      title: `${readyToRelease.length} payments ready to release`,
      sub: `₦${readyNet.toLocaleString("en-NG")} net`,
      count: readyToRelease.length,
    });
  }
  const appliedQueue = await prisma.application.count({ where: { status: "APPLIED" } });
  if (appliedQueue > 0) {
    urgent.push({
      type: "applications",
      title: `${appliedQueue} applications awaiting review`,
      sub: "Review queue",
      count: appliedQueue,
    });
  }
  const submittedSheets = await prisma.timesheet.count({ where: { status: "SUBMITTED" } });
  if (submittedSheets > 0) {
    urgent.push({
      type: "timesheets",
      title: `${submittedSheets} timesheets to approve`,
      sub: "Within 48h SLA",
      count: submittedSheets,
    });
  }

  const activity = recentApps.map((a) => ({
    icon: "check",
    title: `${a.worker.name} approved`,
    sub: a.task.title,
    ago: ago(a.createdAt),
  }));

  res.json({
    activeTasks,
    fillRate,
    avgTimeToFillHours: 6,
    spendThisMonth,
    budgetThisMonth: 5400000,
    // Chart breakdowns are illustrative (static-ish) per the contract note.
    spendByCategory: [
      { label: "Dispatch", value: 62, tone: "clay" },
      { label: "Promo", value: 21, tone: "gold" },
      { label: "Remote", value: 11, tone: "indigo" },
      { label: "Trade", value: 6, tone: "forest" },
    ],
    fill: { filled: approvedApps, open: Math.max(0, totalApps - approvedApps) },
    urgent,
    activity,
  });
});

export default router;
