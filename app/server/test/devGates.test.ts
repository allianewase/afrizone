import { describe, it, expect } from "vitest";
import { totp } from "../src/services/totp";
import { devAuthShortcutsEnabled, isDevEnvironment } from "../src/env";

/**
 * Regression guard for a live production vulnerability.
 *
 * Every developer bypass was gated on `NODE_ENV !== "production"`. Cloudflare
 * Workers do not set NODE_ENV and it was absent from the deployed Worker's
 * bindings, so that expression was TRUE in production and all of them were
 * active on the public internet: a fixed master OTP code (log in as any worker
 * knowing only their phone number), a password-reset token returned in the API
 * response (admin takeover in two requests), and a fixed TOTP code that
 * defeated two-factor auth.
 *
 * The gates now require an explicit opt-in. These tests pin that direction: an
 * UNSET or unrecognised NODE_ENV must leave every bypass OFF.
 */
describe("developer bypass gates fail closed", () => {
  const original = process.env.NODE_ENV;
  const restore = () => {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  };

  it("are DISABLED when NODE_ENV is unset (the production reality that caused this)", () => {
    delete process.env.NODE_ENV;
    try {
      expect(devAuthShortcutsEnabled()).toBe(false);
      expect(isDevEnvironment()).toBe(false);
    } finally {
      restore();
    }
  });

  it("are DISABLED when NODE_ENV is production", () => {
    process.env.NODE_ENV = "production";
    try {
      expect(devAuthShortcutsEnabled()).toBe(false);
    } finally {
      restore();
    }
  });

  it("are DISABLED for any unrecognised NODE_ENV", () => {
    for (const value of ["staging", "prod", "PRODUCTION", "", "dev"]) {
      process.env.NODE_ENV = value;
      expect(devAuthShortcutsEnabled()).toBe(false);
    }
    restore();
  });

  it("are ENABLED only for an explicit development or test environment", () => {
    process.env.NODE_ENV = "development";
    expect(devAuthShortcutsEnabled()).toBe(true);
    process.env.NODE_ENV = "test";
    expect(devAuthShortcutsEnabled()).toBe(true);
    restore();
  });

  it("the fixed TOTP bypass code is rejected when NODE_ENV is unset", () => {
    delete process.env.NODE_ENV;
    try {
      // A real secret, and the bypass code. Must not authenticate.
      expect(totp.verify("JBSWY3DPEHPK3PXP", "000000")).toBe(false);
    } finally {
      restore();
    }
  });
});
