import { Router, Response } from "express";
import crypto from "crypto";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";

const router = Router();

// POST /api/contracts/:id/sign → body {signerName}. Marks SIGNED + signedAt,
// capturing a typed-name e-signature (name, requesting IP, and a SHA-256 hash
// of the signing event for tamper-evidence). Ownership-checked: contract must
// belong to the authed worker.
router.post("/:id/sign", requireAuth, async (req: AuthedRequest, res: Response) => {
  const signerName = String(req.body?.signerName ?? "").trim();
  if (signerName.length < 2) {
    return res.status(400).json({ error: "Type your full name to sign" });
  }

  const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
  if (!contract) return res.status(404).json({ error: "Contract not found" });
  if (contract.workerId !== req.user!.id) {
    return res.status(403).json({ error: "Not your contract" });
  }
  if (contract.signedAt) {
    return res.status(400).json({ error: "Contract already signed" });
  }

  const signedAt = new Date();
  const signerIp = req.ip;
  const signatureHash = crypto
    .createHash("sha256")
    .update(`${contract.id}:${contract.workerId}:${signerName}:${signedAt.toISOString()}`)
    .digest("hex");

  const updated = await prisma.contract.update({
    where: { id: contract.id },
    // Signing records that it was signed. It deliberately does NOT advance the
    // work lifecycle: a signature is consent, not progress, and clocking in is
    // what actually starts the work.
    data: { signedAt, signerName, signerIp, signatureHash },
  });
  res.json(updated);
});

export default router;
