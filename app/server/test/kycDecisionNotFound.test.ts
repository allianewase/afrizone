// Kept as the sole test in this file - see test/kycDecisionHrAdmin.test.ts
// for why.
import { describe, it, expect } from "vitest";
import { apiPost } from "./http";
import { createUserWithToken } from "./helpers";

describe("admin KYC decisions", () => {
  it("404s for a worker id that doesn't exist", async () => {
    const { token: adminToken } = await createUserWithToken("SUPER_ADMIN");
    const res = await apiPost("/api/workers/does-not-exist/kyc", { decision: "TIER_APPROVED" }, adminToken);
    expect(res.status).toBe(404);
  });
});
