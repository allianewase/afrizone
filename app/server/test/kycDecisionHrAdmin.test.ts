// Split out of kyc.test.ts, one test per file (not just one file for both):
// as the 5th/6th D1-touching request in kyc.test.ts's session, these two
// scenarios hung (Workers runtime hang-detector killed the request) -
// confirmed NOT a production bug (the same route, hit repeatedly against a
// real `wrangler dev` instance, never hung), and confirmed unrelated to the
// missing-$disconnect issue fixed in test/apply-migrations.ts (still
// reproduced with that fix applied, and even paired together in their own
// 2-test file). Read as a vitest-pool-workers/Prisma-D1 (both preview-status)
// test-infra limitation tied to per-file D1 query volume - one request per
// file is the reliable workaround. See test/kycDecisionNotFound.test.ts for
// the other half.
import { describe, it, expect } from "vitest";
import { apiPost } from "./http";
import { createUserWithToken } from "./helpers";

describe("admin KYC decisions", () => {
  it("rejects a worker's KYC as HR_ADMIN", async () => {
    const { token: hrToken } = await createUserWithToken("HR_ADMIN");
    const { user: worker } = await createUserWithToken("WORKER", { kycStatus: "PENDING" });

    const res = await apiPost(`/api/workers/${worker.id}/kyc`, { decision: "REJECTED" }, hrToken);
    expect(res.status).toBe(200);
    expect(res.body.kycStatus).toBe("REJECTED");
  });
});
