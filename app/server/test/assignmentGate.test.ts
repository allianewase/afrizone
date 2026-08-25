// POST /api/clock and POST /api/timesheets took a taskId straight from the
// request body and looked it up by id alone, with no check that the caller had
// any relationship to it. These tests assert the attack directly: a worker who
// was never given the task must not be able to clock in on it, nor bill hours
// against it - and an application that is merely APPLIED is not an assignment.
import { describe, it, expect } from "vitest";
import { apiPost } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";

async function makeTask() {
  const { token: adminToken } = await createUserWithToken("SUPER_ADMIN");
  const res = await apiPost(
    "/api/tasks",
    {
      title: "Warehouse stock count",
      description: "Count inventory in the Yaba warehouse",
      category: "Logistics",
      tier: "STUDENT",
      payModel: "HOURLY",
      rate: 1200,
      slots: 2,
    },
    adminToken
  );
  expect(res.status).toBe(201);
  return res.body.id as string;
}

const period = {
  periodStart: "2026-08-24T08:00:00.000Z",
  periodEnd: "2026-08-24T16:00:00.000Z",
  hours: 8,
};

describe("assignment gate", () => {
  it("refuses a clock-in from a worker who never applied", async () => {
    const taskId = await makeTask();
    const { token } = await createUserWithToken("WORKER");

    const res = await apiPost("/api/clock", { taskId, type: "IN" }, token);
    expect(res.status).toBe(403);
    expect(await countClockEvents(taskId)).toBe(0);
  });

  it("refuses a clock-in when the application is only APPLIED", async () => {
    const taskId = await makeTask();
    const { user, token } = await createUserWithToken("WORKER");
    await testPrisma().application.create({
      data: { taskId, workerId: user.id, status: "APPLIED" },
    });

    const res = await apiPost("/api/clock", { taskId, type: "IN" }, token);
    expect(res.status).toBe(403);
    expect(await countClockEvents(taskId)).toBe(0);
  });

  it("allows a clock-in once the application is APPROVED", async () => {
    const taskId = await makeTask();
    const { user, token } = await createUserWithToken("WORKER");
    await testPrisma().application.create({
      data: { taskId, workerId: user.id, status: "APPROVED" },
    });

    const res = await apiPost("/api/clock", { taskId, type: "IN" }, token);
    expect(res.status).toBe(201);
    expect(res.body.clockedIn).toBe(true);
  });

  it("refuses a timesheet for a task the worker was never given", async () => {
    const taskId = await makeTask();
    const { token } = await createUserWithToken("WORKER");

    const res = await apiPost("/api/timesheets", { taskId, ...period }, token);
    expect(res.status).toBe(403);
    expect(await countTimesheets(taskId)).toBe(0);
  });

  it("refuses a timesheet when the application is only APPLIED", async () => {
    const taskId = await makeTask();
    const { user, token } = await createUserWithToken("WORKER");
    await testPrisma().application.create({
      data: { taskId, workerId: user.id, status: "APPLIED" },
    });

    const res = await apiPost("/api/timesheets", { taskId, ...period }, token);
    expect(res.status).toBe(403);
    expect(await countTimesheets(taskId)).toBe(0);
  });

  it("allows a timesheet once the application is APPROVED", async () => {
    const taskId = await makeTask();
    const { user, token } = await createUserWithToken("WORKER");
    await testPrisma().application.create({
      data: { taskId, workerId: user.id, status: "APPROVED" },
    });

    const res = await apiPost("/api/timesheets", { taskId, ...period }, token);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("SUBMITTED");
  });

  it("does not distinguish an unknown task from an unassigned one by leaking a row", async () => {
    const { token } = await createUserWithToken("WORKER");
    const res = await apiPost("/api/clock", { taskId: "does-not-exist", type: "IN" }, token);
    expect(res.status).toBe(404);
  });

  it("another worker's approval is not the caller's assignment", async () => {
    const taskId = await makeTask();
    const { user: assigned } = await createUserWithToken("WORKER");
    await testPrisma().application.create({
      data: { taskId, workerId: assigned.id, status: "APPROVED" },
    });
    const { token: outsiderToken } = await createUserWithToken("WORKER");

    const res = await apiPost("/api/clock", { taskId, type: "IN" }, outsiderToken);
    expect(res.status).toBe(403);
  });
});

function countClockEvents(taskId: string) {
  return testPrisma().clockEvent.count({ where: { taskId } });
}

function countTimesheets(taskId: string) {
  return testPrisma().timesheet.count({ where: { taskId } });
}
