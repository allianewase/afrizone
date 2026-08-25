import type { Task } from "@prisma/client";
import { prisma } from "../prisma";

// A worker is ASSIGNED to a task when an admin has approved their application
// for it. That is exactly the fact the contract is minted from in
// routes/applications.ts, so gating on it here cannot disagree with the task
// list the worker is shown in "My tasks".
//
// Deliberately NOT gated on a signed contract, even though working before
// signing is wrong on paper: the mobile active-task screen lets a worker clock
// in without visiting the contract screen first, so requiring a signature here
// would break the pilot rather than protect it. Signing is enforced where it
// belongs - at approval, which mints the contract.
//
// Why this exists at all: POST /api/clock and POST /api/timesheets both took a
// taskId straight from the request body and looked it up by id alone. Any
// authenticated worker could therefore clock in on, and bill hours against, a
// task they had never applied to - and timesheet approval is the endpoint that
// mints a Payment, so the fabricated row arrived in the admin queue looking
// exactly like a real one.
export type AssignmentResult =
  | { ok: true; task: Task }
  | { ok: false; status: 404 | 403; error: string };

export async function requireAssignedTask(
  workerId: string,
  taskId: unknown
): Promise<AssignmentResult> {
  if (!taskId || typeof taskId !== "string") {
    return { ok: false, status: 404, error: "Task not found" };
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, status: 404, error: "Task not found" };

  const approved = await prisma.application.findFirst({
    where: { taskId: task.id, workerId, status: "APPROVED" },
    select: { id: true },
  });
  if (!approved) {
    return { ok: false, status: 403, error: "You are not assigned to this task" };
  }

  return { ok: true, task };
}
