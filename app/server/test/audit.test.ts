import { describe, it, expect } from "vitest";
import { auditData, userActor, SYSTEM_ACTORS } from "../src/util/audit";

/**
 * AuditLog.actorId was NOT NULL with a foreign key to User, so only a
 * logged-in human could be recorded as an actor and every system-initiated
 * action failed its audit insert. These tests pin the shape that makes an
 * automated actor recordable, and the invariant the database CHECK enforces:
 * every row must be attributable to a user or to a named automation.
 */
describe("audit actor attribution", () => {
  it("records a human as a USER actor with no ref", () => {
    const row = auditData(userActor("user-1"), "PAYMENT_RELEASED", "Payment", "pay-1");
    expect(row.actorId).toBe("user-1");
    expect(row.actorType).toBe("USER");
    expect(row.actorRef).toBeNull();
  });

  it("records an automation with a ref and no user", () => {
    const row = auditData(SYSTEM_ACTORS.paystackWebhook, "PAYOUT_SETTLED", "Withdrawal", "w-1");
    expect(row.actorId).toBeNull();
    expect(row.actorType).toBe("WEBHOOK");
    expect(row.actorRef).toBe("paystack");
  });

  it("lets an automation acting for a known user carry both", () => {
    const row = auditData(
      { type: "WEBHOOK", ref: "smile-identity", userId: "worker-9" },
      "KYC_AUTO_VERIFIED",
      "User",
      "worker-9"
    );
    expect(row.actorId).toBe("worker-9");
    expect(row.actorType).toBe("WEBHOOK");
    expect(row.actorRef).toBe("smile-identity");
  });

  it("every registered system actor satisfies the attributable invariant", () => {
    for (const actor of Object.values(SYSTEM_ACTORS)) {
      const row = auditData(actor, "ACTION", "Entity", "id-1");
      const attributable =
        (row.actorType === "USER" && row.actorId != null) ||
        (row.actorType !== "USER" && row.actorRef != null);
      expect(attributable).toBe(true);
    }
  });

  it("serialises meta to a JSON string, and omits it when absent", () => {
    expect(auditData(userActor("u"), "A", "E", "1", { a: 1 }).meta).toBe('{"a":1}');
    expect(auditData(userActor("u"), "A", "E", "1").meta).toBeNull();
  });
});
