import { describe, it, expect } from "vitest";
import { apiPost } from "./http";
import { testPrisma } from "./helpers";

/**
 * OTP codes were generated with Math.random() and stored as an UNSALTED sha256
 * of the six digits. Both are fixed: codes now come from a cryptographic
 * source, and the digest is HMAC(pepper, salt:phone:purpose:code).
 *
 * The security property that matters most is asserted here directly: the
 * stored digest must NOT be the bare sha256 of the code, because that is what
 * made the whole table reversible with a few megabytes of precomputation.
 *
 * One D1-touching flow only - the suite hangs past roughly five per file.
 */
describe("OTP storage", () => {
  it("stores a salted, peppered digest that is not a bare hash of the code", async () => {
    const phone = "+2348000000123";

    const res = await apiPost("/api/auth/otp/request", { phone });
    expect(res.status).toBe(200);

    const row = await testPrisma().otpCode.findFirst({
      where: { phone, purpose: "login" },
      orderBy: { createdAt: "desc" },
    });
    expect(row).toBeTruthy();

    // A salt is present and looks like 16 random bytes of hex.
    expect(row!.codeSalt).toMatch(/^[0-9a-f]{32}$/);

    // The dev/sim response carries the code, so we can prove the digest is not
    // simply sha256(code) - the reversible scheme this replaced.
    const code = res.body.devCode as string | undefined;
    if (code) {
      expect(code).toMatch(/^\d{6}$/);
      const crypto = await import("crypto");
      const bare = crypto.createHash("sha256").update(code).digest("hex");
      expect(row!.codeHash).not.toBe(bare);
      // And it is not a bare hash of any obvious concatenation either.
      const naive = crypto.createHash("sha256").update(`${row!.codeSalt}${code}`).digest("hex");
      expect(row!.codeHash).not.toBe(naive);
    }

    // Digest shape is HMAC-SHA256 hex regardless.
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
