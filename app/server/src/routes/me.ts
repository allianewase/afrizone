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

// GET /api/me → the authed worker profile.
router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    tiers: tiersToArray(user.tiers),
    kycStatus: user.kycStatus,
    location: user.location,
    bankMasked: user.bankMasked,
    rating: user.rating,
    completedCount: user.completedCount,
  });
});

// PATCH /api/me → update the authed user's profile (name / email). Used after a
// phone-OTP or Google signup (which start with placeholder name/email) and for
// profile edits. Email must stay unique.
router.patch("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const { name, email } = req.body || {};
  const data: { name?: string; email?: string } = {};

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
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const user = await prisma.user.update({ where: { id: req.user!.id }, data });
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    tiers: tiersToArray(user.tiers),
    kycStatus: user.kycStatus,
    location: user.location,
    bankMasked: user.bankMasked,
    rating: user.rating,
    completedCount: user.completedCount,
  });
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
  const { bankMasked, bankCode, bankAccountNumber, bankName, tier } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  let tiers = tiersToArray(user.tiers);
  if (tier && !tiers.includes(tier as Tier)) {
    tiers = [...tiers, tier as Tier];
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      bankMasked: bankMasked != null ? String(bankMasked) : user.bankMasked,
      bankCode: bankCode != null ? String(bankCode) : user.bankCode,
      bankAccountNumber: bankAccountNumber != null ? String(bankAccountNumber) : user.bankAccountNumber,
      bankName: bankName != null ? String(bankName) : user.bankName,
      tiers: tiersToString(tiers),
      kycStatus: "PENDING",
    },
  });
  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    tiers: tiersToArray(updated.tiers),
    kycStatus: updated.kycStatus,
    location: updated.location,
    bankMasked: updated.bankMasked,
    rating: updated.rating,
    completedCount: updated.completedCount,
  });
});

export default router;
