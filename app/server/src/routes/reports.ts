import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";

const router = Router();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthBounds(year: number, month: number) {
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0, 23, 59, 59, 999),
  };
}

// GET /api/reports/summary
router.get("/summary", requireAuth, async (_req: AuthedRequest, res: Response) => {
  const [payments, allTasks] = await Promise.all([
    prisma.payment.findMany({
      where: { status: { in: ["RELEASED", "APPROVED"] } },
      include: { task: { select: { category: true } } },
    }),
    prisma.task.findMany({ select: { status: true, createdAt: true } }),
  ]);

  const grossPaid = payments.reduce((s, p) => s + p.gross, 0);
  const totalWht = payments.reduce((s, p) => s + p.whtAmount, 0);
  const netPaid = payments.reduce((s, p) => s + p.net, 0);
  const workersPaid = new Set(payments.map((p) => p.workerId)).size;

  // Spend by task category (real)
  const byCategory = new Map<string, number>();
  for (const p of payments) {
    const label = p.task?.category || "Other";
    byCategory.set(label, (byCategory.get(label) || 0) + p.gross);
  }
  const totalSpend = grossPaid || 1;
  const spendByCategory = Array.from(byCategory.entries())
    .map(([label, amount]) => ({ label, amount, pct: Math.round((amount / totalSpend) * 100) }))
    .sort((a, b) => b.amount - a.amount);

  // Top categories: task count + spend per category (real)
  const taskCountByCategory = new Map<string, number>();
  for (const p of payments) {
    const label = p.task?.category || "Other";
    taskCountByCategory.set(label, (taskCountByCategory.get(label) || 0) + 1);
  }
  const topCategories = Array.from(byCategory.entries())
    .map(([label, amount]) => ({ label, tasks: taskCountByCategory.get(label) || 0, spend: amount }))
    .sort((a, b) => b.spend - a.spend);

  // Spend by month — last 6 months, fully derived from payment createdAt
  const now = new Date();
  const spendByMonth = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const { start, end } = monthBounds(d.getFullYear(), d.getMonth());
    const spend = payments
      .filter((p) => p.createdAt >= start && p.createdAt <= end)
      .reduce((s, p) => s + p.gross, 0);
    spendByMonth.push({ month: MONTHS[d.getMonth()], spend });
  }

  // Fill-rate trend — last 6 months, per task-creation cohort
  // Rate = tasks created that month that are now FILLED or CLOSED / all tasks created that month.
  const fillRateTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const { start, end } = monthBounds(d.getFullYear(), d.getMonth());
    const cohort = allTasks.filter((t) => t.createdAt >= start && t.createdAt <= end);
    const filled = cohort.filter((t) => t.status === "FILLED" || t.status === "CLOSED").length;
    const rate = cohort.length > 0 ? Math.round((filled / cohort.length) * 100) : 0;
    fillRateTrend.push({ month: MONTHS[d.getMonth()], rate });
  }

  // Spend by department — derived from categories (no department field in v1)
  const spendByDepartment = spendByCategory.map(({ label, amount }) => ({
    label,
    amount,
  }));

  res.json({
    spendByMonth,
    spendByCategory,
    spendByDepartment,
    tax: {
      whtCollected: totalWht,
      vatCollected: 0,
      remittedToFirs: totalWht,
    },
    fillRateTrend,
    payrollEquivalent: {
      grossPaid,
      totalWht,
      netPaid,
      workersPaid,
    },
    topCategories,
  });
});

export default router;
