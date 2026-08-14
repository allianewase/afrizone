import { describe, it, expect } from "vitest";
import { apiPost } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";

describe("worker KYC submission", () => {
  it("submits KYC details and lands in PENDING (no Smile ID configured)", async () => {
    const { token, user } = await createUserWithToken("WORKER");

    const res = await apiPost(
      "/api/me/kyc/submit",
      {
        tin: "12345678",
        bankMasked: "****1234",
        bankCode: "058",
        bankAccountNumber: "0123456789",
        bankName: "GTBank",
        tier: "DISPATCH_RIDER",
      },
      token
    );

    expect(res.status).toBe(200);
    expect(res.body.kycStatus).toBe("PENDING");
    expect(res.body.tiers).toContain("DISPATCH_RIDER");
    expect(res.body.bankMasked).toBe("****1234");

    const stored = await testPrisma().user.findUnique({ where: { id: user.id } });
    expect(stored?.tin).toBe("12345678");
  });
});

describe("admin KYC decisions", () => {
  it("rejects a decision from a non-admin role", async () => {
    const { token: workerToken, user: worker } = await createUserWithToken("WORKER", {
      kycStatus: "PENDING",
    });
    const res = await apiPost(`/api/workers/${worker.id}/kyc`, { decision: "TIER_APPROVED" }, workerToken);
    expect(res.status).toBe(403);
  });

  it("rejects an invalid decision value", async () => {
    const { token: adminToken } = await createUserWithToken("SUPER_ADMIN");
    const { user: worker } = await createUserWithToken("WORKER", { kycStatus: "PENDING" });
    const res = await apiPost(`/api/workers/${worker.id}/kyc`, { decision: "MAYBE" }, adminToken);
    expect(res.status).toBe(400);
  });

  it("approves a worker's KYC as SUPER_ADMIN", async () => {
    const { token: adminToken } = await createUserWithToken("SUPER_ADMIN");
    const { user: worker } = await createUserWithToken("WORKER", { kycStatus: "PENDING" });

    const res = await apiPost(`/api/workers/${worker.id}/kyc`, { decision: "TIER_APPROVED" }, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.kycStatus).toBe("TIER_APPROVED");

    const stored = await testPrisma().user.findUnique({ where: { id: worker.id } });
    expect(stored?.kycStatus).toBe("TIER_APPROVED");
  });
});

// "rejects a worker's KYC as HR_ADMIN" and "404s for a worker id that
// doesn't exist" live in test/kycDecisionHrAdmin.test.ts and
// test/kycDecisionNotFound.test.ts, not here - see the note in either for why.
