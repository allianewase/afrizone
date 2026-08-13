import { Router, Response } from "express";
import crypto from "crypto";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";
import { paystack } from "../services/paystack";

const router = Router();

const MIN_WITHDRAWAL = 5000; // ₦5,000 minimum.

// Available balance = Σ net of RELEASED payments − Σ non-failed withdrawals.
async function availableBalance(workerId: string): Promise<number> {
  const [payments, withdrawals] = await Promise.all([
    prisma.payment.findMany({ where: { workerId, status: "RELEASED" } }),
    prisma.withdrawal.findMany({ where: { workerId, status: { not: "FAILED" } } }),
  ]);
  const released = payments.reduce((s, p) => s + p.net, 0);
  const withdrawn = withdrawals.reduce((s, w) => s + w.amount, 0);
  return released - withdrawn;
}

// POST /api/wallet/withdraw → body {amount}. Acting worker = req.user.id.
// Guards: integer, ≥ ₦5,000, ≤ available. Creates a Withdrawal and (when
// PAYSTACK_SECRET is set) initiates a real Paystack transfer; otherwise runs
// in SIMULATED mode (status stays PROCESSING until settled).
router.post("/withdraw", requireAuth, async (req: AuthedRequest, res: Response) => {
  const workerId = req.user!.id;
  const { amount } = req.body || {};
  const amt = Number(amount);
  if (!Number.isInteger(amt)) {
    return res.status(400).json({ error: "amount must be a whole-Naira integer" });
  }
  if (amt < MIN_WITHDRAWAL) {
    return res.status(400).json({ error: `Minimum withdrawal is ₦${MIN_WITHDRAWAL}` });
  }

  const worker = await prisma.user.findUnique({ where: { id: workerId } });
  if (!worker) return res.status(404).json({ error: "Worker not found" });
  if (!worker.bankMasked) {
    return res.status(400).json({ error: "No bank account on file. Submit KYC first." });
  }

  const available = await availableBalance(workerId);
  if (amt > available) {
    return res.status(400).json({ error: "Amount exceeds available balance" });
  }

  const reference = `afz_wd_${crypto.randomUUID()}`;
  const provider = paystack.enabled ? "paystack" : "simulated";

  // Create the ledger row first (PROCESSING) so we never lose track of intent.
  const withdrawal = await prisma.withdrawal.create({
    data: {
      workerId,
      amount: amt,
      bankMasked: worker.bankMasked,
      status: "PROCESSING",
      provider,
      reference,
    },
  });

  if (paystack.enabled) {
    // Real payout requires a NUBAN account + bank code on the worker.
    if (!worker.bankAccountNumber || !worker.bankCode) {
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: "FAILED", failureReason: "Missing payout account number / bank code" },
      });
      return res.status(400).json({
        error: "Add a payout bank account (account number + bank code) before withdrawing.",
      });
    }
    try {
      const recipientCode = await paystack.createRecipient({
        name: worker.name,
        accountNumber: worker.bankAccountNumber,
        bankCode: worker.bankCode,
      });
      const transfer = await paystack.initiateTransfer({
        amountNaira: amt,
        recipientCode,
        reference,
        reason: "Afrizone Part Time earnings payout",
      });
      const updated = await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { providerRef: transfer.transferCode },
      });
      // Paystack settles asynchronously; the webhook flips PROCESSING → PAID/FAILED.
      return res.status(201).json(updated);
    } catch (err: any) {
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: "FAILED", failureReason: String(err?.message || err) },
      });
      return res.status(502).json({ error: `Payout failed: ${err?.message || "provider error"}` });
    }
  }

  // SIMULATED mode (no PAYSTACK_SECRET): stays PROCESSING. Use the dev-settle
  // endpoint below (or a real webhook once live) to mark it PAID.
  return res.status(201).json({ ...withdrawal, simulated: true });
});

// DEV ONLY: settle the caller's PROCESSING withdrawals to PAID, to demo the
// full flow without webhooks. Disabled when Paystack is live (real settlement
// must come from the verified webhook).
router.post("/dev/settle", requireAuth, async (req: AuthedRequest, res: Response) => {
  if (paystack.enabled) {
    return res.status(403).json({ error: "Live mode: settlement happens via the Paystack webhook." });
  }
  const result = await prisma.withdrawal.updateMany({
    where: { workerId: req.user!.id, status: "PROCESSING" },
    data: { status: "PAID" },
  });
  res.json({ settled: result.count });
});

export default router;
