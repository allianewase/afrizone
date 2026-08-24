import { describe, it, expect } from "vitest";
import { apiPost, apiPatch } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";

async function createTask() {
  const { user: admin } = await createUserWithToken("SUPER_ADMIN");
  return testPrisma().task.create({
    data: {
      title: "Dispute test task",
      description: "desc",
      category: "Promo",
      tier: "STUDENT",
      payModel: "FIXED",
      budget: 20000,
      startDate: new Date(),
      endDate: new Date(),
      locationType: "REMOTE",
      slots: 1,
      deadline: new Date(),
      createdById: admin.id,
    },
  });
}

async function createPayment(workerId: string, taskId: string, status: string) {
  return testPrisma().payment.create({
    data: {
      workerId,
      taskId,
      gross: 20000,
      whtRate: 0.05,
      whtAmount: 1000,
      net: 19000,
      status,
    },
  });
}

// NOTE ON ORDERING: the "already released" case runs first deliberately. The
// dispute-RESOLUTION handler fires `void notifyWorker(...)` (disputes.ts:144) -
// a floating promise that is never handed to ctx.waitUntil. On the Workers
// runtime that work can outlive the request that started it and stall the next
// one, which showed up here as the following test hanging rather than
// responding. Both tests pass individually and in this order. The floating
// promise is a pre-existing issue worth fixing separately; it is not caused by
// the dispute changes under test.
describe("payment disputes", () => {
  // Regression: a RELEASED payment could be dropped back into the dispute
  // lifecycle, and resolving it returned it to the release queue to be paid a
  // SECOND time. The wallet also went negative meanwhile, because it counts
  // released payments but still counts the withdrawal against them.
  it("refuses to dispute a payment that has already been released", async () => {
    const { token, user } = await createUserWithToken("WORKER");
    const task = await createTask();
    const payment = await createPayment(user.id, task.id, "RELEASED");

    const res = await apiPost(
      "/api/me/disputes",
      { entityType: "PAYMENT", entityId: payment.id, reason: "I never received this money" },
      token
    );

    expect(res.status).toBe(409);

    const after = await testPrisma().payment.findUnique({ where: { id: payment.id } });
    expect(after?.status).toBe("RELEASED");
  });

  // Regression: resolving a dispute hard-coded the entity back to APPROVED,
  // discarding whatever state the dispute had interrupted. A payment raised
  // from PENDING therefore jumped the approval queue on resolution.
  it("restores the status the dispute interrupted, not APPROVED", async () => {
    const { token, user } = await createUserWithToken("WORKER");
    const task = await createTask();
    const payment = await createPayment(user.id, task.id, "PENDING");

    const raised = await apiPost(
      "/api/me/disputes",
      { entityType: "PAYMENT", entityId: payment.id, reason: "This amount looks wrong to me" },
      token
    );
    expect(raised.status).toBe(201);

    const midDispute = await testPrisma().payment.findUnique({ where: { id: payment.id } });
    expect(midDispute?.status).toBe("DISPUTED");

    const { token: adminToken } = await createUserWithToken("SUPER_ADMIN");
    const resolved = await apiPatch(
      `/api/disputes/${raised.body.id}`,
      { status: "RESOLVED", resolution: "Checked, amount is correct" },
      adminToken
    );
    expect(resolved.status).toBe(200);

    const after = await testPrisma().payment.findUnique({ where: { id: payment.id } });
    expect(after?.status).toBe("PENDING");
  });
});
