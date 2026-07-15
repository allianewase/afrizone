import request from "supertest";
import app from "../src/index";
import { prisma, createUserWithToken } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("worker KYC submission", () => {
  it("submits KYC details and lands in PENDING (no Smile ID configured)", async () => {
    const { token, user } = await createUserWithToken("WORKER");

    const res = await request(app)
      .post("/api/me/kyc/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tin: "12345678",
        bankMasked: "****1234",
        bankCode: "058",
        bankAccountNumber: "0123456789",
        bankName: "GTBank",
        tier: "DISPATCH_RIDER",
      });

    expect(res.status).toBe(200);
    expect(res.body.kycStatus).toBe("PENDING");
    expect(res.body.tiers).toContain("DISPATCH_RIDER");
    expect(res.body.bankMasked).toBe("****1234");

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored?.tin).toBe("12345678");
  });
});

describe("admin KYC decisions", () => {
  it("rejects a decision from a non-admin role", async () => {
    const { token: workerToken, user: worker } = await createUserWithToken("WORKER", {
      kycStatus: "PENDING",
    });
    const res = await request(app)
      .post(`/api/workers/${worker.id}/kyc`)
      .set("Authorization", `Bearer ${workerToken}`)
      .send({ decision: "TIER_APPROVED" });
    expect(res.status).toBe(403);
  });

  it("rejects an invalid decision value", async () => {
    const { token: adminToken } = await createUserWithToken("SUPER_ADMIN");
    const { user: worker } = await createUserWithToken("WORKER", { kycStatus: "PENDING" });
    const res = await request(app)
      .post(`/api/workers/${worker.id}/kyc`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "MAYBE" });
    expect(res.status).toBe(400);
  });

  it("approves a worker's KYC as SUPER_ADMIN", async () => {
    const { token: adminToken } = await createUserWithToken("SUPER_ADMIN");
    const { user: worker } = await createUserWithToken("WORKER", { kycStatus: "PENDING" });

    const res = await request(app)
      .post(`/api/workers/${worker.id}/kyc`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "TIER_APPROVED" });
    expect(res.status).toBe(200);
    expect(res.body.kycStatus).toBe("TIER_APPROVED");

    const stored = await prisma.user.findUnique({ where: { id: worker.id } });
    expect(stored?.kycStatus).toBe("TIER_APPROVED");
  });

  it("rejects a worker's KYC as HR_ADMIN", async () => {
    const { token: hrToken } = await createUserWithToken("HR_ADMIN");
    const { user: worker } = await createUserWithToken("WORKER", { kycStatus: "PENDING" });

    const res = await request(app)
      .post(`/api/workers/${worker.id}/kyc`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ decision: "REJECTED" });
    expect(res.status).toBe(200);
    expect(res.body.kycStatus).toBe("REJECTED");
  });

  it("404s for a worker id that doesn't exist", async () => {
    const { token: adminToken } = await createUserWithToken("SUPER_ADMIN");
    const res = await request(app)
      .post("/api/workers/does-not-exist/kyc")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "TIER_APPROVED" });
    expect(res.status).toBe(404);
  });
});
