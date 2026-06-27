import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";
import { ClockType, CLOCK_TYPES } from "../types";

const router = Router();

// GEOFENCE DECISION:
// The Task model stores geofenceRadius (metres) and an address, but NOT a
// canonical lat/lng for the task location. For this demo we therefore treat any
// provided coords on a PHYSICAL task as in-fence (withinFence = true), since we
// have no reference point to measure distance against. Rules applied:
//   - REMOTE task                       → withinFence = true (no geofence)
//   - PHYSICAL task, lat & lng provided  → withinFence = true (demo: trust coords)
//   - PHYSICAL task, coords missing      → withinFence = false (cannot verify)
// If/when Task gains lat/lng, swap the PHYSICAL branch for a haversine check
// against task.geofenceRadius.

// POST /api/clock → body {taskId, type:"IN"|"OUT", lat?, lng?}.
// Acting worker = req.user.id. → {event, clockedIn, elapsedSeconds}.
router.post("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const workerId = req.user!.id;
  const { taskId, type, lat, lng, note } = req.body || {};
  if (!taskId) return res.status(400).json({ error: "taskId is required" });
  if (!CLOCK_TYPES.includes(type as ClockType)) {
    return res.status(400).json({ error: 'type must be "IN" or "OUT"' });
  }

  const task = await prisma.task.findUnique({ where: { id: String(taskId) } });
  if (!task) return res.status(404).json({ error: "Task not found" });

  const hasCoords = lat != null && lng != null;
  let withinFence: boolean;
  if (task.locationType === "REMOTE") {
    withinFence = true;
  } else if (hasCoords) {
    // Demo: provided coords on a physical task are treated as in-fence.
    withinFence = true;
  } else {
    withinFence = false;
  }

  const event = await prisma.clockEvent.create({
    data: {
      workerId,
      taskId: task.id,
      type: type as ClockType,
      lat: hasCoords ? Number(lat) : null,
      lng: hasCoords ? Number(lng) : null,
      withinFence,
      note: note != null ? String(note) : null,
    },
  });

  // clockedIn reflects the latest event for this task by this worker.
  const clockedIn = event.type === "IN";
  let elapsedSeconds = 0;
  if (clockedIn) {
    elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(event.createdAt).getTime()) / 1000));
  } else {
    // On OUT, report elapsed since the matching prior IN, if any.
    const lastIn = await prisma.clockEvent.findFirst({
      where: { workerId, taskId: task.id, type: "IN" },
      orderBy: { createdAt: "desc" },
    });
    if (lastIn) {
      elapsedSeconds = Math.max(
        0,
        Math.floor((new Date(event.createdAt).getTime() - new Date(lastIn.createdAt).getTime()) / 1000)
      );
    }
  }

  res.status(201).json({ event, clockedIn, elapsedSeconds });
});

export default router;
