import { describe, it, expect } from "vitest";
import { apiPost } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";

/**
 * Regression: the withdrawal reference was a fresh UUID per request, so its
 * UNIQUE constraint could never fire and a RETRY created a second withdrawal.
 * A courier double-tapping on a patchy connection got paid twice.
 *
 * Deliberately ONE test in its own file: this file's flow already makes
 * several D1-touching requests, and the suite has a documented ceiling of
 * roughly five per file before the Workers test runtime hangs (see
 * kycDecisionHrAdmin.test.ts, which exists as a one-test file for the same
 * reason).
 */
describe("withdrawal idempotency", () => {
  it("returns the original withdrawal when the same key is retried, and never pays twice", async () => {
    const { token, user } = await createUserWithToken("WORKER", { bankMasked: "****1234" });

    const admin = await createUserWithToken("SUPER_ADMIN");
    const task = await testPrisma().task.create({
      data: {
        title: "Idempotency test task",
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
        createdById: admin.user.id,
      },
    });
    await testPrisma().payment.create({
      data: {
        workerId: user.id,
        taskId: task.id,
        gross: 10000,
        whtRate: 0.05,
        whtAmount: 500,
        net: 9500,
        status: "RELEASED",
      },
    });

    const key = "retry-key-abcdef123";

    const first = await apiPost("/api/wallet/withdraw", { amount: 9000, idempotencyKey: key }, token);
    expect(first.status).toBe(201);

    // The retry a flaky connection produces: same key, same amount.
    const retry = await apiPost("/api/wallet/withdraw", { amount: 9000, idempotencyKey: key }, token);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);

    // The money moved once, not twice.
    const rows = await testPrisma().withdrawal.findMany({ where: { workerId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(9000);

    // And createdAt survived the raw insert as a real date, not a number -
    // the D1 adapter types a numeric column as Double and would destabilise
    // reads of the whole table.
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(Number.isNaN(rows[0].createdAt.getTime())).toBe(false);
  });
});
