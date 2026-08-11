import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, AuthedRequest } from "../auth";

const router = Router();

// POST /api/workers/:id/rate: admin rates a worker for a completed task.
// body: { taskId, score (1–5), note? }
// Upserts (one rating per worker per task); recalculates user.rating as average.
router.post(
  "/:id/rate",
  requireAuth,
  requireRole("SUPER_ADMIN", "TASK_MANAGER"),
  async (req: AuthedRequest, res: Response) => {
    const { taskId, score, note } = req.body || {};

    const scoreNum = Number(score);
    if (!Number.isInteger(scoreNum) || scoreNum < 1 || scoreNum > 5) {
      return res.status(400).json({ error: "score must be an integer between 1 and 5" });
    }
    if (!taskId || typeof taskId !== "string") {
      return res.status(400).json({ error: "taskId is required" });
    }

    const worker = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!worker || worker.role !== "WORKER") {
      return res.status(404).json({ error: "Worker not found" });
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return res.status(404).json({ error: "Task not found" });

    // Upsert: update existing rating for this worker+task, or create new.
    await prisma.rating.upsert({
      where: { workerId_taskId: { workerId: worker.id, taskId: task.id } },
      update: { score: scoreNum, note: note ? String(note).trim() : null },
      create: {
        workerId: worker.id,
        taskId: task.id,
        score: scoreNum,
        note: note ? String(note).trim() : null,
        createdById: req.user!.id,
      },
    });

    // Recalculate aggregate rating and completedCount.
    const allRatings = await prisma.rating.findMany({ where: { workerId: worker.id } });
    const avg =
      allRatings.length > 0
        ? allRatings.reduce((s, r) => s + r.score, 0) / allRatings.length
        : null;

    const updated = await prisma.user.update({
      where: { id: worker.id },
      data: {
        rating: avg !== null ? Math.round(avg * 10) / 10 : null,
        completedCount: allRatings.length,
      },
    });

    res.json({
      id: updated.id,
      name: updated.name,
      rating: updated.rating,
      completedCount: updated.completedCount,
    });
  }
);

export default router;
