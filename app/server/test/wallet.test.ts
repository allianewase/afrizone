import request from "supertest";
import app from "../src/index";
import { prisma, createUserWithToken } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

async function createTask() {
  const { user: admin } = await createUserWithToken("SUPER_ADMIN");
  return prisma.task.create({
    data: {
      title: "Wallet test task",
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

describe("wallet withdrawals", () => {
  it("rejects a withdrawal with no bank account on file", async () => {
    const { token } = await createUserWithToken("WORKER");
    const res = await request(app)
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 6000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/KYC/i);
  });

  it("rejects a non-integer amount and an amount below the minimum", async () => {
    const { token } = await createUserWithToken("WORKER", { bankMasked: "****1234" });

    const notInt = await request(app)
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 100.5 });
    expect(notInt.status).toBe(400);

    const tooLow = await request(app)
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 1000 });
    expect(tooLow.status).toBe(400);
  });

  it("rejects a withdrawal above the available balance", async () => {
    const { token } = await createUserWithToken("WORKER", { bankMasked: "****1234" });
    const res = await request(app)
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 6000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds/i);
  });

  it("withdraws successfully against a released payment, then dev-settles it", async () => {
    const { token, user } = await createUserWithToken("WORKER", { bankMasked: "****1234" });
    const task = await createTask();
    await prisma.payment.create({
      data: {
        workerId: user.id,
        taskId: task.id,
        gross: 10000,
        whtAmount: 500,
        net: 9500,
        status: "RELEASED",
      },
    });

    const withdraw = await request(app)
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 9500 });
    expect(withdraw.status).toBe(201);
    expect(withdraw.body.status).toBe("PROCESSING");
    expect(withdraw.body.simulated).toBe(true);

    // Available balance is now fully committed — a second withdrawal should fail.
    const again = await request(app)
      .post("/api/wallet/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 5000 });
    expect(again.status).toBe(400);

    const settle = await request(app)
      .post("/api/wallet/dev/settle")
      .set("Authorization", `Bearer ${token}`);
    expect(settle.status).toBe(200);
    expect(settle.body.settled).toBe(1);

    const stored = await prisma.withdrawal.findFirst({ where: { workerId: user.id } });
    expect(stored?.status).toBe("PAID");
  });
});
