import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";

const router = Router();

// POST /api/contracts/:id/sign → marks SIGNED + signedAt.
// Ownership-checked: contract must belong to the authed worker.
router.post("/:id/sign", requireAuth, async (req: AuthedRequest, res: Response) => {
  const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
  if (!contract) return res.status(404).json({ error: "Contract not found" });
  if (contract.workerId !== req.user!.id) {
    return res.status(403).json({ error: "Not your contract" });
  }
  if (contract.status === "SIGNED") {
    return res.status(400).json({ error: "Contract already signed" });
  }

  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: { status: "SIGNED", signedAt: new Date() },
  });
  res.json(updated);
});

export default router;
