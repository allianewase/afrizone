import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";

const router = Router();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// GET /api/reports/summary
// Computes tax.whtCollected, payrollEquivalent, and spendByCategory from real
// Payment rows (status RELEASED + APPROVED). Monthly/trend arrays are partly
// illustrative but include the current month from real data.
router.get("/summary", requireAuth, async (_req: AuthedRequest, res: Response) => {
  // Counted spend = released + approved payments.
  const payments = await prisma.payment.findMany({
    where: { status: { in: ["RELEASED", "APPROVED"] } },
    include: { task: true },
  });

  const grossPaid = payments.reduce((s, p) => s + p.gross, 0);
  const totalWht = payments.reduce((s, p) => s + p.whtAmount, 0);
  const netPaid = payments.reduce((s, p) => s + p.net, 0);
  const workersPaid = new Set(payments.map((p) => p.workerId)).size;

  // Spend by task category (real).
  const byCategory = new Map<string, number>();
  for (const p of payments) {
    const label = p.task?.category || "Other";
    byCategory.set(label, (byCategory.get(label) || 0) + p.gross);
  }
  const totalSpend = grossPaid || 1;
  const spendByCategory = Array.from(byCategory.entries())
    .map(([label, amount]) => ({ label, amount, pct: Math.round((amount / totalSpend) * 100) }))
    .sort((a, b) => b.amount - a.amount);

  // Top categories (real): task count + spend per category.
  const taskCountByCategory = new Map<string, number>();
  for (const p of payments) {
    const label = p.task?.category || "Other";
    taskCountByCategory.set(label, (taskCountByCategory.get(label) || 0) + 1);
  }
  const topCategories = Array.from(byCategory.entries())
    .map(([label, amount]) => ({ label, tasks: taskCountByCategory.get(label) || 0, spend: amount }))
    .sort((a, b) => b.spend - a.spend);

  // Spend by month — last 6 months. Current month is real (counted spend);
  // earlier months are illustrative (history is thin in the demo).
  const now = new Date();
  const currentMonthIdx = now.getMonth();
  const illustrative = [1200000, 1450000, 1310000, 1580000, 1420000];
  const spendByMonth = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), currentMonthIdx - i, 1);
    const isCurrent = i === 0;
    spendByMonth.push({
      month: MONTHS[d.getMonth()],
      spend: isCurrent ? grossPaid : illustrative[(5 - i) % illustrative.length],
    });
  }

  // Fill-rate trend — illustrative, with current month derived from task fill.
  const [filledTasks, totalTasks] = await Promise.all([
    prisma.task.count({ where: { status: "FILLED" } }),
    prisma.task.count(),
  ]);
  const currentFillRate = totalTasks > 0 ? Math.round((filledTasks / totalTasks) * 100) : 0;
  const illustrativeRates = [74, 78, 81, 79, 84];
  const fillRateTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), currentMonthIdx - i, 1);
    const isCurrent = i === 0;
    fillRateTrend.push({
      month: MONTHS[d.getMonth()],
      rate: isCurrent ? currentFillRate : illustrativeRates[(5 - i) % illustrativeRates.length],
    });
  }

  // Spend by department — illustrative (no department on tasks/payments in v1).
  const spendByDepartment = [
    { label: "Logistics", amount: Math.round(grossPaid * 0.4) },
    { label: "Marketing", amount: Math.round(grossPaid * 0.35) },
    { label: "Operations", amount: Math.round(grossPaid * 0.25) },
  ];

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
