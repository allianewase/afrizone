import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";

const router = Router();

// GET /api/search?q=<query>  (min 2 chars)
// Returns tasks and workers matching the query string.
// Admin-only: searches across every worker, task and payment on the platform.
router.get("/", requireAuth, requireRole("SUPER_ADMIN", "HR_ADMIN", "TASK_MANAGER"), async (req: AuthedRequest, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json({ tasks: [], workers: [] });

  const [tasks, workers] = await Promise.all([
    prisma.task.findMany({
      where: {
        OR: [
          { title: { contains: q } },
          { category: { contains: q } },
          { description: { contains: q } },
        ],
      },
      select: { id: true, title: true, status: true, category: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.user.findMany({
      where: {
        role: "WORKER",
        OR: [
          { name: { contains: q } },
          { email: { contains: q } },
        ],
      },
      select: { id: true, name: true, email: true, kycStatus: true },
      orderBy: { name: "asc" },
      take: 5,
    }),
  ]);

  res.json({ tasks, workers });
});

export default router;
