import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";
import { tiersToArray, tiersToString, Tier } from "../types";

const router = Router();

// Derived wallet for the acting worker.
//   pending   = net of payments earned but not yet released (PENDING/APPROVED)
//   withdrawn = sum of non-failed withdrawals (in-flight PROCESSING + settled PAID)
//   available = released earnings minus what's already been withdrawn
// FAILED withdrawals are excluded so they don't reduce the balance.
function walletFrom(
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
  const available = released - withdrawn;
  return { pending, available, withdrawn };
}

// Shared response shape for all /api/me endpoints that return the worker profile.
function formatUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    tiers: tiersToArray(user.tiers),
    kycStatus: user.kycStatus,
    location: user.location,
    bankMasked: user.bankMasked,
    bankCode: user.bankCode ?? null,
    bankName: user.bankName ?? null,
    tin: user.tin ?? null,
    rating: user.rating,
    completedCount: user.completedCount,
    totpEnabled: user.totpEnabled,
    notifTasks: user.notifTasks,
    notifPay: user.notifPay,
    notifEmail: user.notifEmail,
  };
}

// GET /api/me → the authed worker profile.
router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(formatUser(user));
});

// PATCH /api/me → update profile fields: name, email, tin, bank details.
// Used after phone-OTP/Google signup and for profile edits in the mobile app.
router.patch("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const { name, email, tin, bankCode, bankAccountNumber, bankName, notifTasks, notifPay, notifEmail } = req.body || {};
  const data: Record<string, unknown> = {};

  if (name !== undefined) {
    const n = String(name).trim();
    if (n.length < 2) return res.status(400).json({ error: "Please enter your full name" });
    data.name = n;
  }
  if (email !== undefined) {
    const e = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }
    const clash = await prisma.user.findUnique({ where: { email: e } });
    if (clash && clash.id !== req.user!.id) {
      return res.status(409).json({ error: "That email is already in use" });
    }
    data.email = e;
  }
  if (tin !== undefined) {
    const t = String(tin).trim();
    if (t.length > 0 && t.length < 8) {
      return res.status(400).json({ error: "TIN must be at least 8 characters" });
    }
    data.tin = t || null;
  }
  if (bankCode !== undefined) data.bankCode = String(bankCode).trim() || null;
  if (bankName !== undefined) data.bankName = String(bankName).trim() || null;
  if (bankAccountNumber !== undefined) {
    const acct = String(bankAccountNumber).replace(/\D/g, "");
    if (acct && acct.length !== 10) {
      return res.status(400).json({ error: "Account number must be exactly 10 digits" });
    }
    data.bankAccountNumber = acct || null;
    // Recompute masked form: "BankName ••XX"
    if (acct && (bankName || data.bankName)) {
      const bName = String(bankName ?? data.bankName ?? "");
      data.bankMasked = `${bName} ••${acct.slice(-2)}`;
    }
  }

  if (notifTasks !== undefined) data.notifTasks = Boolean(notifTasks);
  if (notifPay !== undefined) data.notifPay = Boolean(notifPay);
  if (notifEmail !== undefined) data.notifEmail = Boolean(notifEmail);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const user = await prisma.user.update({ where: { id: req.user!.id }, data });
  res.json(formatUser(user));
});

// GET /api/me/applications → worker's applications joined with task summary.
router.get("/applications", requireAuth, async (req: AuthedRequest, res: Response) => {
  const apps = await prisma.application.findMany({
    where: { workerId: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: { task: true },
  });
  res.json(
    apps.map((a) => ({
      id: a.id,
      taskId: a.taskId,
      pitch: a.pitch,
      status: a.status,
      reason: a.reason,
      createdAt: a.createdAt,
      task: {
        id: a.task.id,
        title: a.task.title,
        category: a.task.category,
        tier: a.task.tier,
        payModel: a.task.payModel,
        rate: a.task.rate,
        budget: a.task.budget,
        status: a.task.status,
        address: a.task.address,
        locationType: a.task.locationType,
        startDate: a.task.startDate,
        endDate: a.task.endDate,
      },
    }))
  );
});

// GET /api/me/wallet → {pending, available, withdrawn}.
router.get("/wallet", requireAuth, async (req: AuthedRequest, res: Response) => {
  const [payments, withdrawals] = await Promise.all([
    prisma.payment.findMany({ where: { workerId: req.user!.id } }),
    prisma.withdrawal.findMany({ where: { workerId: req.user!.id } }),
  ]);
  res.json(walletFrom(payments, withdrawals));
});

// GET /api/me/transactions → merged earnings + withdrawals, newest-first.
router.get("/transactions", requireAuth, async (req: AuthedRequest, res: Response) => {
  const [payments, withdrawals] = await Promise.all([
    prisma.payment.findMany({
      where: { workerId: req.user!.id },
      include: { task: true },
    }),
    prisma.withdrawal.findMany({ where: { workerId: req.user!.id } }),
  ]);
  const earnings = payments.map((p) => ({
    id: p.id,
    kind: "earning" as const,
    title: p.task.title,
    amount: p.net,
    status: p.status,
    createdAt: p.createdAt,
  }));
  const wds = withdrawals.map((w) => ({
    id: w.id,
    kind: "withdrawal" as const,
    title: `Withdrawal to ${w.bankMasked}`,
    amount: w.amount,
    status: w.status,
    createdAt: w.createdAt,
  }));
  const merged = [...earnings, ...wds].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json(merged);
});

// GET /api/me/clock/:taskId → resume state for the active-task screen.
router.get("/clock/:taskId", requireAuth, async (req: AuthedRequest, res: Response) => {
  const last = await prisma.clockEvent.findFirst({
    where: { workerId: req.user!.id, taskId: req.params.taskId },
    orderBy: { createdAt: "desc" },
  });
  if (!last) {
    return res.json({ clockedIn: false, lastEventAt: null, elapsedSeconds: 0 });
  }
  const clockedIn = last.type === "IN";
  const elapsedSeconds = clockedIn
    ? Math.max(0, Math.floor((Date.now() - new Date(last.createdAt).getTime()) / 1000))
    : 0;
  res.json({ clockedIn, lastEventAt: last.createdAt, elapsedSeconds });
});

// GET /api/me/contracts → worker's contracts joined with task summary.
router.get("/contracts", requireAuth, async (req: AuthedRequest, res: Response) => {
  const contracts = await prisma.contract.findMany({
    where: { workerId: req.user!.id },
    orderBy: { createdAt: "desc" },
    include: { task: true },
  });
  res.json(
    contracts.map((c) => ({
      id: c.id,
      status: c.status,
      signedAt: c.signedAt,
      task: { id: c.task.id, title: c.task.title },
    }))
  );
});

// PATCH /api/me/push-token → body {pushToken}. Upserts the Expo push token for this worker.
router.patch("/push-token", requireAuth, async (req: AuthedRequest, res: Response) => {
  const { pushToken } = req.body || {};
  if (!pushToken || typeof pushToken !== "string") {
    return res.status(400).json({ error: "pushToken is required" });
  }
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { pushToken },
  });
  res.json({ ok: true });
});

// POST /api/me/kyc/submit → body {tin?, bankMasked?, bankCode?, bankAccountNumber?, bankName?, tier?}.
router.post("/kyc/submit", requireAuth, async (req: AuthedRequest, res: Response) => {
  const { tin, bankMasked, bankCode, bankAccountNumber, bankName, tier } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  let tiers = tiersToArray(user.tiers);
  if (tier && !tiers.includes(tier as Tier)) {
    tiers = [...tiers, tier as Tier];
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      tin: tin != null ? String(tin) : user.tin,
      bankMasked: bankMasked != null ? String(bankMasked) : user.bankMasked,
      bankCode: bankCode != null ? String(bankCode) : user.bankCode,
      bankAccountNumber: bankAccountNumber != null ? String(bankAccountNumber) : user.bankAccountNumber,
      bankName: bankName != null ? String(bankName) : user.bankName,
      tiers: tiersToString(tiers),
      kycStatus: "PENDING",
    },
  });
  res.json(formatUser(updated));
});

// GET /api/me/tax-statement?year=YYYY → CSV of released WHT payments for that year.
router.get("/tax-statement", requireAuth, async (req: AuthedRequest, res: Response) => {
  const year = parseInt(String(req.query.year ?? new Date().getFullYear()), 10);
  if (isNaN(year) || year < 2020 || year > 2099) {
    return res.status(400).json({ error: "Invalid year" });
  }
  const from = new Date(`${year}-01-01T00:00:00.000Z`);
  const to = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const [user, payments] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user!.id } }),
    prisma.payment.findMany({
      where: { workerId: req.user!.id, status: "RELEASED", createdAt: { gte: from, lt: to } },
      include: { task: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!user) return res.status(404).json({ error: "User not found" });

  const totalGross = payments.reduce((s, p) => s + p.gross, 0);
  const totalWht = payments.reduce((s, p) => s + p.whtAmount, 0);
  const totalNet = payments.reduce((s, p) => s + p.net, 0);

  const rows = [
    "Afrizone Part Time - Annual WHT Statement",
    `Worker:,${user.name ?? "-"}`,
    `Email/Phone:,${user.email ?? user.phone ?? "-"}`,
    `TIN:,${user.tin ?? "Not provided"}`,
    `Year:,${year}`,
    "",
    "Date,Task,Gross (NGN),WHT 5% (NGN),Net (NGN)",
    ...payments.map((p) =>
      [
        new Date(p.createdAt).toISOString().slice(0, 10),
        `"${p.task.title.replace(/"/g, '""')}"`,
        p.gross,
        p.whtAmount,
        p.net,
      ].join(",")
    ),
    "",
    `TOTAL,,${totalGross},${totalWht},${totalNet}`,
  ];

  const safeName = (user.name ?? "statement")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `afrizone-wht-${year}-${safeName}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(rows.join("\r\n"));
});

export default router;
