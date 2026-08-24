import { describe, it, expect } from "vitest";
import { canReadKycDocument } from "../src/routes/kycDocuments";

/**
 * The file route used to authorise with `if (!owns && role === "WORKER")` -
 * it named the single role to DENY and therefore granted every other role,
 * including ones that did not exist yet. Adding COURIER to ROLES would have
 * handed every courier read access to every worker's government ID and selfie.
 *
 * These tests pin the allow-by-list property. The "unknown role" cases cannot
 * be reached over HTTP (verifyToken rejects any role not in ROLES), which is
 * exactly why the predicate is exported and tested directly - the guarantee
 * has to survive someone adding a role later.
 */
describe("canReadKycDocument", () => {
  const doc = { userId: "worker-1" };

  it("lets the owner read their own document", () => {
    expect(canReadKycDocument({ sub: "worker-1", role: "WORKER" }, doc)).toBe(true);
  });

  it("refuses a different worker", () => {
    expect(canReadKycDocument({ sub: "worker-2", role: "WORKER" }, doc)).toBe(false);
  });

  it("lets each admin role read any document", () => {
    for (const role of ["SUPER_ADMIN", "HR_ADMIN", "TASK_MANAGER"]) {
      expect(canReadKycDocument({ sub: "someone-else", role }, doc)).toBe(true);
    }
  });

  // The regression that matters: a role nobody anticipated must be DENIED.
  it("refuses any role it has never heard of", () => {
    for (const role of ["COURIER", "SOURCING_AGENT", "STORE_STAFF", "MERCHANT", "", "worker"]) {
      expect(canReadKycDocument({ sub: "someone-else", role }, doc)).toBe(false);
    }
  });

  it("refuses a token carrying no role at all", () => {
    expect(canReadKycDocument({ sub: "someone-else" }, doc)).toBe(false);
    expect(canReadKycDocument({ sub: "someone-else", role: null }, doc)).toBe(false);
  });

  // Previously the ownership row was consulted only as a deny signal, so an
  // admin token reached the R2 read for ANY caller-supplied key - including
  // objects under the kyc/ prefix with no database row behind them.
  it("refuses when no document row exists, even for an admin", () => {
    expect(canReadKycDocument({ sub: "admin-1", role: "SUPER_ADMIN" }, null)).toBe(false);
    expect(canReadKycDocument({ sub: "admin-1", role: "SUPER_ADMIN" }, undefined)).toBe(false);
  });
});
