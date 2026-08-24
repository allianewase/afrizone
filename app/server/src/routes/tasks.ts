import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRole, isAdmin, AuthedRequest } from "../auth";
import { tiersToArray } from "../types";

const router = Router();

// Augment a task with filledCount + applicantCount.
async function withCounts(task: any) {
  const [filledCount, applicantCount] = await Promise.all([
    prisma.application.count({ where: { taskId: task.id, status: "APPROVED" } }),
    prisma.application.count({ where: { taskId: task.id } }),
  ]);
  return { ...task, filledCount, applicantCount };
}

// GET /api/tasks → Task[] each augmented with filledCount, applicantCount
router.get("/", requireAuth, async (_req: AuthedRequest, res: Response) => {
  const tasks = await prisma.task.findMany({ orderBy: { createdAt: "desc" } });
  const augmented = await Promise.all(tasks.map(withCounts));
  res.json(augmented);
});

// POST /api/tasks → create
// Admin-only. Guarded per-handler, NOT at the router: GET / and GET /:id below
// are the mobile app's task feed and must stay open to workers.
// createdById is attribution, not authorization - an unguarded version let a
// worker mint a task with any budget and then apply to it.
router.post("/", requireAuth, requireRole("SUPER_ADMIN", "TASK_MANAGER"), async (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  if (!b.title || !b.description || !b.category || !b.tier || !b.payModel) {
    return res.status(400).json({ error: "title, description, category, tier, payModel are required" });
  }
  if (b.payModel === "HOURLY" && b.rate == null) {
    return res.status(400).json({ error: "rate is required for HOURLY tasks" });
  }
  if (b.payModel === "FIXED" && b.budget == null) {
    return res.status(400).json({ error: "budget is required for FIXED tasks" });
  }
  try {
    const task = await prisma.task.create({
      data: {
        title: b.title,
        description: b.description,
        category: b.category,
        tier: b.tier,
        payModel: b.payModel,
        rate: b.rate ?? null,
        budget: b.budget ?? null,
        startDate: b.startDate ? new Date(b.startDate) : new Date(),
        endDate: b.endDate ? new Date(b.endDate) : new Date(),
        locationType: b.locationType || "PHYSICAL",
        address: b.address ?? null,
        lat: b.lat != null ? Number(b.lat) : null,
        lng: b.lng != null ? Number(b.lng) : null,
        geofenceRadius: b.geofenceRadius ?? 100,
        slots: b.slots ?? 1,
        status: b.status || "OPEN",
        deadline: b.deadline ? new Date(b.deadline) : new Date(),
        createdById: req.user!.id,
      },
    });
    res.status(201).json(await withCounts(task));
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Could not create task" });
  }
});

// GET /api/tasks/:id → Task + applications (with worker summary)
router.get("/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: {
      applications: {
        orderBy: { createdAt: "desc" },
        include: { worker: true },
      },
    },
  });
  if (!task) return res.status(404).json({ error: "Task not found" });

  const applications = task.applications.map((a) => ({
    id: a.id,
    taskId: a.taskId,
    workerId: a.workerId,
    pitch: a.pitch,
    status: a.status,
    reason: a.reason,
    createdAt: a.createdAt,
    worker: {
      id: a.worker.id,
      name: a.worker.name,
      tiers: tiersToArray(a.worker.tiers),
      kycStatus: a.worker.kycStatus,
      rating: a.worker.rating,
    },
  }));

  const { applications: _drop, ...taskFields } = task as any;
  const counts = await withCounts(taskFields);
  // Workers legitimately read this route (the mobile task-detail screen), but
  // must not see who else applied - the applicant list carries other workers'
  // names, tiers, KYC status and ratings. Allow-by-list, not
  // `role === "WORKER"`: a deny-by-exception check fails open for any
  // unexpected role value.
  if (!isAdmin(req.user?.role)) return res.json(counts);
  res.json({ ...counts, applications });
});

// PATCH /api/tasks/:id → partial update
// Admin-only: rate, budget and status are writable here, so an unguarded
// version let any worker rewrite a task's pay before claiming it.
router.patch("/:id", requireAuth, requireRole("SUPER_ADMIN", "TASK_MANAGER"), async (req: AuthedRequest, res: Response) => {
  const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Task not found" });

  const b = req.body || {};
  const data: any = {};
  const stringFields = ["title", "description", "category", "tier", "payModel", "locationType", "address", "status"];
  for (const f of stringFields) if (b[f] !== undefined) data[f] = b[f];
  const intFields = ["rate", "budget", "geofenceRadius", "slots"];
  for (const f of intFields) if (b[f] !== undefined) data[f] = b[f];
  if (b.lat !== undefined) data.lat = b.lat != null ? Number(b.lat) : null;
  if (b.lng !== undefined) data.lng = b.lng != null ? Number(b.lng) : null;
  const dateFields = ["startDate", "endDate", "deadline"];
  for (const f of dateFields) if (b[f] !== undefined) data[f] = new Date(b[f]);

  const task = await prisma.task.update({ where: { id: req.params.id }, data });
  res.json(await withCounts(task));
});

export default router;
