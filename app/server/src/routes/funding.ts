import { Router, Response } from "express";
import crypto from "crypto";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";
import { paystack } from "../services/paystack";

const router = Router();

// Platform balance = Σ SUCCESS fundings − Σ non-failed withdrawals.
// Informational only for now — does not gate withdrawal approval.
async function platformBalance(): Promise<number> {
  const [fundings, withdrawals] = await Promise.all([
    prisma.funding.findMany({ where: { status: "SUCCESS" } }),
    prisma.withdrawal.findMany({ where: { status: { not: "FAILED" } } }),
  ]);
  const funded = fundings.reduce((s, f) => s + f.amount, 0);
  const paidOut = withdrawals.reduce((s, w) => s + w.amount, 0);
  return funded - paidOut;
}

// GET /api/admin/funding/balance
router.get("/balance", requireAuth, requireRole("SUPER_ADMIN"), async (_req: AuthedRequest, res: Response) => {
  res.json({ balance: await platformBalance() });
});

// GET /api/admin/funding — history, newest first.
router.get("/", requireAuth, requireRole("SUPER_ADMIN"), async (_req: AuthedRequest, res: Response) => {
  const fundings = await prisma.funding.findMany({
    orderBy: { createdAt: "desc" },
    include: { admin: { select: { id: true, name: true } } },
  });
  res.json(fundings);
});

// POST /api/admin/funding/initialize → body {amount}
// Creates a PENDING Funding row and (when PAYSTACK_SECRET is set) starts a
// real hosted-checkout transaction; otherwise runs in SIMULATED mode.
router.post(
  "/initialize",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req: AuthedRequest, res: Response) => {
    const { amount } = req.body || {};
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) {
      return res.status(400).json({ error: "amount must be a positive whole-Naira integer" });
    }

    const admin = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!admin) return res.status(404).json({ error: "Admin not found" });

    const reference = `afz_fund_${crypto.randomUUID()}`;
    const provider = paystack.enabled ? "paystack" : "simulated";

    const funding = await prisma.funding.create({
      data: { amount: amt, status: "PENDING", provider, reference, initiatedBy: admin.id },
    });

    if (!paystack.enabled) {
      return res.status(201).json({ ...funding, simulated: true });
    }

    try {
      const webAdminUrl = process.env.WEB_ADMIN_URL || "http://localhost:5173";
      const { authorizationUrl, accessCode } = await paystack.initializeTransaction({
        amountNaira: amt,
        email: admin.email,
        reference,
        callbackUrl: `${webAdminUrl}/settings?billing_ref=${reference}`,
      });
      const updated = await prisma.funding.update({
        where: { id: funding.id },
        data: { providerRef: accessCode },
      });
      // Paystack settles asynchronously; the webhook flips PENDING → SUCCESS/FAILED.
      return res.status(201).json({ ...updated, authorizationUrl });
    } catch (err: any) {
      await prisma.funding.update({ where: { id: funding.id }, data: { status: "FAILED" } });
      return res.status(502).json({ error: `Funding init failed: ${err?.message || "provider error"}` });
    }
  }
);

// DEV ONLY — settle all PENDING fundings to SUCCESS, to demo the full flow
// without a real Paystack webhook. Disabled when Paystack is live.
router.post("/dev/settle", requireAuth, requireRole("SUPER_ADMIN"), async (_req: AuthedRequest, res: Response) => {
  if (paystack.enabled) {
    return res.status(403).json({ error: "Live mode: settlement happens via the Paystack webhook." });
  }
  const result = await prisma.funding.updateMany({
    where: { status: "PENDING" },
    data: { status: "SUCCESS" },
  });
  res.json({ settled: result.count });
});

export default router;
