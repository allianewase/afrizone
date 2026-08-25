import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthedRequest } from "../auth";
import { ClockType, CLOCK_TYPES } from "../types";
import { requireAssignedTask } from "../util/assignment";

const router = Router();

/** Great-circle distance in metres between two WGS-84 points (Haversine). */
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GEOFENCE DECISION (applied per clock event):
//   - REMOTE task                                → withinFence = true  (no zone)
//   - PHYSICAL task, task has lat/lng, worker has coords
//                                                → haversine check vs task.geofenceRadius
//   - PHYSICAL task, task has lat/lng, no worker coords
//                                                → withinFence = false (can't verify)
//   - PHYSICAL task, task has NO lat/lng         → withinFence = true  (zone not configured)

// POST /api/clock → body {taskId, type:"IN"|"OUT", lat?, lng?}.
// Acting worker = req.user.id. → {event, clockedIn, elapsedSeconds}.
router.post("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const workerId = req.user!.id;
  const { taskId, type, lat, lng, note } = req.body || {};
  if (!taskId) return res.status(400).json({ error: "taskId is required" });
  if (!CLOCK_TYPES.includes(type as ClockType)) {
    return res.status(400).json({ error: 'type must be "IN" or "OUT"' });
  }

  // Clocking in is only meaningful on a task this worker was actually given.
  const assignment = await requireAssignedTask(workerId, taskId);
  if (!assignment.ok) return res.status(assignment.status).json({ error: assignment.error });
  const { task } = assignment;

  const hasWorkerCoords = lat != null && lng != null;
  const hasTaskCoords = task.lat != null && task.lng != null;
  let withinFence: boolean;
  if (task.locationType === "REMOTE") {
    withinFence = true;
  } else if (!hasTaskCoords) {
    withinFence = true; // geofence not configured for this task
  } else if (!hasWorkerCoords) {
    withinFence = false; // task has a zone but worker didn't share location
  } else {
    const dist = haversineMetres(Number(lat), Number(lng), task.lat!, task.lng!);
    withinFence = dist <= task.geofenceRadius;
  }

  const event = await prisma.clockEvent.create({
    data: {
      workerId,
      taskId: task.id,
      type: type as ClockType,
      lat: hasWorkerCoords ? Number(lat) : null,
      lng: hasWorkerCoords ? Number(lng) : null,
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
