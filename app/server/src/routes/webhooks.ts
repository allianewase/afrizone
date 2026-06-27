import { Router, Request, Response } from "express";
import { prisma } from "../prisma";
import { paystack } from "../services/paystack";

const router = Router();

// POST /api/webhooks/paystack
// Receives transfer.* events and reconciles the matching Withdrawal.
// The raw body is needed for signature verification — index.ts mounts
// express.raw() on this path BEFORE the global express.json().
router.post("/paystack", async (req: Request, res: Response) => {
  const signature = req.header("x-paystack-signature");
  const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

  if (!paystack.verifyWebhook(raw, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event: any;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Bad payload" });
  }

  const type: string = event?.event || "";
  const data = event?.data || {};
  const reference: string | undefined = data.reference;
  const transferCode: string | undefined = data.transfer_code;

  // Locate the withdrawal by our reference (preferred) or Paystack transfer_code.
  const withdrawal = await prisma.withdrawal.findFirst({
    where: {
      OR: [reference ? { reference } : undefined, transferCode ? { providerRef: transferCode } : undefined].filter(
        Boolean
      ) as any,
    },
  });

  if (withdrawal) {
    if (type === "transfer.success") {
      await prisma.withdrawal.update({ where: { id: withdrawal.id }, data: { status: "PAID" } });
    } else if (type === "transfer.failed" || type === "transfer.reversed") {
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: "FAILED", failureReason: data.reason || type },
      });
    }
  }

  // Always 200 so Paystack stops retrying.
  res.json({ received: true });
});

export default router;
