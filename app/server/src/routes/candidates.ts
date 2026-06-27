import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";
import { writeAudit } from "../util/audit";
import { STAGES } from "../types";

const router = Router();

// GET /api/candidates?jobId= → JobApplication[] joined with job {id,title}
router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const jobId = req.query.jobId ? String(req.query.jobId) : undefined;
  const candidates = await prisma.jobApplication.findMany({
    where: jobId ? { jobId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { job: true },
  });
  res.json(
    candidates.map((c) => ({
      id: c.id,
      jobId: c.jobId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      stage: c.stage,
      cvNote: c.cvNote,
      rating: c.rating,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      job: { id: c.job.id, title: c.job.title },
    }))
  );
});

// POST /api/candidates → create (stage SCREENING)
router.post("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  if (!b.jobId || !b.name || !b.email) {
    return res.status(400).json({ error: "jobId, name, email are required" });
  }
  const job = await prisma.job.findUnique({ where: { id: b.jobId } });
  if (!job) return res.status(404).json({ error: "Job not found" });

  try {
    const candidate = await prisma.jobApplication.create({
      data: {
        jobId: b.jobId,
        name: b.name,
        email: b.email,
        phone: b.phone ?? null,
        cvNote: b.cvNote ?? null,
        stage: "SCREENING",
      },
    });
    res.status(201).json(candidate);
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Could not create candidate" });
  }
});

// POST /api/candidates/:id/move → body {stage}; writes AuditLog "candidate.move"
router.post("/:id/move", requireAuth, async (req: AuthedRequest, res: Response) => {
  const { stage } = req.body || {};
  if (!stage || !STAGES.includes(stage)) {
    return res.status(400).json({ error: `stage must be one of ${STAGES.join(", ")}` });
  }
  const candidate = await prisma.jobApplication.findUnique({ where: { id: req.params.id } });
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const updated = await prisma.jobApplication.update({
    where: { id: candidate.id },
    data: { stage },
  });
  await writeAudit(req.user!.id, "candidate.move", "JobApplication", candidate.id, {
    from: candidate.stage,
    to: stage,
    jobId: candidate.jobId,
  });
  res.json(updated);
});

export default router;
