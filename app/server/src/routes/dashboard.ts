import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";

const router = Router();

function ago(date: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

const TONE_CYCLE = ["clay", "gold", "indigo", "forest", "money", "amber"];
const CATEGORY_TONES: Record<string, string> = {
  Dispatch: "clay",
  Promo: "gold",
  Remote: "indigo",
  Trade: "forest",
  Student: "money",
};

function monthBounds(year: number, month: number) {
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0, 23, 59, 59, 999),
  };
}

// GET /api/dashboard/stats
router.get("/stats", requireAuth, requireRole("SUPER_ADMIN", "HR_ADMIN", "TASK_MANAGER"), async (_req: AuthedRequest, res: Response) => {
  const now = new Date();
  const { start: monthStart, end: monthEnd } = monthBounds(now.getFullYear(), now.getMonth());

  const [
    activeTasks,
    filledTasks,
    totalTasks,
    recentApps,
    paymentsAll,
    paymentsThisMonth,
    openDisputes,
    appliedQueue,
    submittedSheets,
    tasksWithFirstApproval,
  ] = await Promise.all([
    prisma.task.count({ where: { status: "OPEN" } }),
    prisma.task.count({ where: { status: "FILLED" } }),
    prisma.task.count(),
    prisma.application.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { worker: true, task: true },
    }),
    prisma.payment.findMany({ select: { net: true, status: true } }),
    prisma.payment.findMany({
      where: { createdAt: { gte: monthStart, lte: monthEnd } },
      select: { gross: true, net: true, status: true, task: { select: { category: true } } },
    }),
    prisma.dispute.count({ where: { status: "OPEN" } }),
    prisma.application.count({ where: { status: "APPLIED" } }),
    prisma.timesheet.count({ where: { status: "SUBMITTED" } }),
    // Avg time-to-fill: tasks that have at least one approved application.
    prisma.task.findMany({
      where: { applications: { some: { status: "APPROVED" } } },
      select: {
        createdAt: true,
        applications: {
          where: { status: "APPROVED" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
  ]);

  // Fill rate
  const fillRate = totalTasks > 0 ? Math.round((filledTasks / totalTasks) * 100) : 0;

  // Avg time-to-fill in hours (task created → first approved application)
  const ttfSamples = tasksWithFirstApproval
    .filter((t) => t.applications.length > 0)
    .map((t) => (t.applications[0].createdAt.getTime() - t.createdAt.getTime()) / 3_600_000);
  const avgTimeToFillHours =
    ttfSamples.length > 0
      ? Math.round((ttfSamples.reduce((s, h) => s + h, 0) / ttfSamples.length) * 10) / 10
      : 0;

  // Spend this month (released > 0 ? released : all committed), scoped to the
  // same calendar month as budgetThisMonth so the two figures stay paired.
  const releasedSpendMonth = paymentsThisMonth
    .filter((p) => p.status === "RELEASED")
    .reduce((s, p) => s + p.net, 0);
  const committedSpendMonth = paymentsThisMonth.reduce((s, p) => s + p.net, 0);
  const spendThisMonth = releasedSpendMonth > 0 ? releasedSpendMonth : committedSpendMonth;

  // Budget this month = total gross committed (all statuses) in the calendar month
  const budgetThisMonth = paymentsThisMonth.reduce((s, p) => s + p.gross, 0);

  // Spend by category from this month's payments (same window as above)
  const byCategory = new Map<string, number>();
  for (const p of paymentsThisMonth) {
    const label = p.task?.category || "Other";
    byCategory.set(label, (byCategory.get(label) || 0) + p.gross);
  }
  const totalGross = paymentsThisMonth.reduce((s, p) => s + p.gross, 0) || 1;
  const spendByCategory = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, gross], i) => ({
      label,
      value: Math.round((gross / totalGross) * 100),
      tone: CATEGORY_TONES[label] ?? TONE_CYCLE[i % TONE_CYCLE.length],
    }));

  // Urgent items
  const readyToRelease = paymentsAll.filter((p) => p.status === "APPROVED");
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
  if (appliedQueue > 0) {
    urgent.push({
      type: "applications",
      title: `${appliedQueue} applications awaiting review`,
      sub: "Review queue",
      count: appliedQueue,
    });
  }
  if (submittedSheets > 0) {
    urgent.push({
      type: "timesheets",
      title: `${submittedSheets} timesheets to approve`,
      sub: "Within 48h SLA",
      count: submittedSheets,
    });
  }
  if (openDisputes > 0) {
    urgent.push({
      type: "dispute",
      title: `${openDisputes} open dispute${openDisputes > 1 ? "s" : ""} raised`,
      sub: "Worker-raised, needs review",
      count: openDisputes,
    });
  }

  // Activity feed
  const activity = recentApps.map((a) => ({
    icon: "check",
    title: `${a.worker.name} approved`,
    sub: a.task.title,
    ago: ago(a.createdAt),
  }));

  res.json({
    activeTasks,
    fillRate,
    avgTimeToFillHours,
    spendThisMonth,
    budgetThisMonth,
    spendByCategory,
    fill: { filled: filledTasks, open: activeTasks },
    urgent,
    activity,
  });
});

export default router;
