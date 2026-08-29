// Auto-task generation (Blueprint §5).
//
// "The feature that makes PartTime powerful rather than just another gig board
// is that the Afrizonemart platform creates work automatically." What that
// actually requires is three things being right, and this file is mostly about
// those three:
//
//   A retry must be FREE. Mart retries on timeouts and 500s, and an event
//   processed twice is two people sent to do one job.
//
//   A repeated FACT must not become repeated WORK. A shelf that stays empty
//   emits stock.low every time the threshold is checked; without a per-type
//   de-duplication rule, an hour of that is an hour of tasks.
//
//   Nothing may be silently dropped. order.confirmed used to create nothing at
//   all, because delivery was not built; it was recorded DEFERRED rather than
//   swallowed, and every one of those orders is still replayable. It now creates
//   a Delivery - see delivery.test.ts for what happens to one after that.
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { SELF } from "cloudflare:test";
import { apiGet } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";
import { decodePayload, intakeMartEvent, verifyMartSignature } from "../src/services/martEvents";
import { ruleFor } from "../src/services/taskRules";

const prisma = () => testPrisma() as any;

const SECRET = "local-dev-mart-inbound-secret";

// Task.createdById is a required foreign key, so a generated task still needs a
// person to attribute it to - work the platform created is attributed to a real
// admin rather than dead-ending at "the system". Production always has one
// (the seed creates it), so the fixture reflects that rather than each test
// remembering.
beforeAll(async () => {
  await createUserWithToken("SUPER_ADMIN");
});

let seq = 0;
function evt(type: string, data: Record<string, unknown>, id?: string) {
  seq += 1;
  return {
    eventId: id ?? `evt_${seq}_${Date.now()}`,
    type,
    occurredAt: new Date().toISOString(),
    data,
  };
}

/** Post a signed event through the real worker handler. */
async function postSigned(body: unknown, opts: { secret?: string; skewSeconds?: number } = {}) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000) + (opts.skewSeconds ?? 0));
  const sig = crypto
    .createHmac("sha256", opts.secret ?? SECRET)
    .update(`${ts}.${raw}`)
    .digest("hex");
  const res = await SELF.fetch("http://local.test/api/integrations/mart/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Afz-Timestamp": ts,
      "X-Afz-Signature": sig,
    },
    body: raw,
  });
  return { status: res.status, body: (await res.json().catch(() => undefined)) as any };
}

describe("the signature", () => {
  const body = '{"eventId":"e1"}';
  const ts = String(Math.floor(Date.now() / 1000));
  const good = crypto.createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");

  it("accepts a correctly signed request", () => {
    expect(verifyMartSignature(body, ts, good, SECRET).ok).toBe(true);
  });

  it("refuses a body that was changed after signing", () => {
    expect(verifyMartSignature('{"eventId":"e2"}', ts, good, SECRET).ok).toBe(false);
  });

  it("refuses a timestamp that was changed after signing", () => {
    // The timestamp is INSIDE the signed string. If it were merely sent
    // alongside, moving it would cost an attacker nothing and the replay window
    // would be decorative.
    const moved = String(Number(ts) - 30);
    expect(verifyMartSignature(body, moved, good, SECRET).ok).toBe(false);
  });

  it("refuses a replay from outside the window", () => {
    const old = String(Math.floor(Date.now() / 1000) - 600);
    const sig = crypto.createHmac("sha256", SECRET).update(`${old}.${body}`).digest("hex");
    // Correctly signed, but six minutes ago. Paystack's own scheme has no
    // timestamp and is replayable forever; we control both ends here.
    expect(verifyMartSignature(body, old, sig, SECRET).ok).toBe(false);
  });

  it("refuses when the integration is not configured", () => {
    // No secret must never mean "let everything through".
    expect(verifyMartSignature(body, ts, good, undefined).ok).toBe(false);
  });

  it("refuses a missing signature outright", () => {
    expect(verifyMartSignature(body, ts, undefined, SECRET).ok).toBe(false);
    expect(verifyMartSignature(body, undefined, good, SECRET).ok).toBe(false);
  });
});

describe("the endpoint", () => {
  it("rejects an unsigned request with 401", async () => {
    const res = await SELF.fetch("http://local.test/api/integrations/mart/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evt("stock.low", { sku: "X" })),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a request signed with the wrong secret", async () => {
    const res = await postSigned(evt("stock.low", { sku: "X" }), { secret: "not-the-secret" });
    expect(res.status).toBe(401);
  });

  it("rejects a stale request", async () => {
    const res = await postSigned(evt("stock.low", { sku: "X" }), { skewSeconds: -600 });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown event type", async () => {
    const res = await postSigned(evt("customer.angry", {}));
    expect(res.status).toBe(400);
  });

  it("rejects an event with no id", async () => {
    const res = await postSigned({ type: "stock.low", data: { sku: "X" } });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("eventId");
  });
});

describe("stock.low becomes a sourcing task", () => {
  it("creates a gated sourcing task", async () => {
    const res = await postSigned(
      evt("stock.low", {
        sku: `SKU-${Date.now()}`,
        productName: "Peak Milk 400g",
        currentQty: 0,
        reorderThreshold: 24,
        targetQty: 120,
        region: "lagos-mainland",
      })
    );
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PROCESSED");

    const task = await prisma().task.findUnique({ where: { id: res.body.taskId } });
    expect(task.kind).toBe("SOURCING");
    const rule = await ruleFor("SOURCING");
    // Mart sent no budget, no deadline and no tier. Those are ours - a pay band
    // in Mart's payload would mean changing Mart's code to pay sourcers more.
    expect(task.budget).toBe(rule.fee);
    expect(task.tier).toBe(rule.tier);
    expect(task.requiresIdentityVerified).toBe(true);
  });

  it("does not create a second task while one is still open", async () => {
    const sku = `SKU-DUP-${Date.now()}`;
    const payload = { sku, productName: "Repeated Item", region: "lagos-mainland" };

    const first = await postSigned(evt("stock.low", payload));
    // A DIFFERENT event id describing the SAME situation - which is exactly what
    // a shelf that stays empty produces every time the threshold is checked.
    const second = await postSigned(evt("stock.low", payload));

    expect(first.status).toBe(201);
    expect(second.status).toBe(202);
    expect(second.body.status).toBe("IGNORED");
    expect(second.body.taskId).toBe(first.body.taskId);

    const tasks = await prisma().task.findMany({
      where: { kind: "SOURCING", title: "Source Repeated Item (lagos-mainland)" },
    });
    expect(tasks).toHaveLength(1);
  });

  it("refuses an event with no sku", async () => {
    const res = await postSigned(evt("stock.low", { productName: "Nameless" }));
    expect(res.status).toBe(400);
    // Recorded as FAILED rather than lost, so somebody can see what Mart sent.
    const row = await prisma().martEvent.findFirst({ where: { status: "FAILED" } });
    expect(row).not.toBeNull();
  });
});

describe("store.applied registers the store and sends an auditor", () => {
  it("creates a PENDING organization and an audit task", async () => {
    await prisma().credentialType.upsert({
      where: { slug: "auditor-accreditation" },
      update: {},
      create: {
        name: "Auditor accreditation",
        slug: "auditor-accreditation",
        reviewMode: "ADMIN_REVIEW",
        issuerMode: "AFRIZONE",
        requiresExpiry: false,
        requiresReference: false,
        requiresFile: false,
        active: true,
      },
    });

    const appId = `APP-${Date.now()}`;
    const res = await postSigned(
      evt("store.applied", {
        applicationId: appId,
        businessName: "Surulere Fresh Foods",
        address: "14 Adeniran Ogunsanya, Surulere",
        lat: 6.4969,
        lng: 3.354,
        contact: { phone: "+2348030000123", email: "ada@example.com" },
        registration: { cac: "RC1234567", tin: "12345678-0001" },
      })
    );
    expect(res.status).toBe(201);

    const org = await prisma().organization.findFirst({
      where: { name: "Surulere Fresh Foods" },
    });
    // PartTime owns the store record, so this creates it rather than expecting
    // Mart to have one. Mart forwarded a lead, not a business.
    expect(org).not.toBeNull();
    // Never approved on arrival - a person approves, after an audit.
    expect(org.status).toBe("PENDING");

    const task = await prisma().task.findUnique({ where: { id: res.body.taskId } });
    expect(task.kind).toBe("STORE_AUDIT");
    expect(task.organizationId).toBe(org.id);
  });

  it("does not register the same application twice", async () => {
    const appId = `APP-DUP-${Date.now()}`;
    const payload = {
      applicationId: appId,
      businessName: "Twice Applied Stores",
      address: "1 Somewhere Road",
      lat: 6.5,
      lng: 3.35,
    };
    await postSigned(evt("store.applied", payload));
    const second = await postSigned(evt("store.applied", payload));

    expect(second.body.status).toBe("IGNORED");
    const orgs = await prisma().organization.findMany({
      where: { name: "Twice Applied Stores" },
    });
    expect(orgs).toHaveLength(1);
  });
});

describe("listing.needs_media becomes a photography task", () => {
  it("creates one", async () => {
    const res = await postSigned(
      evt("listing.needs_media", {
        listingId: `LST-${Date.now()}`,
        productName: "Indomie Chicken 70g",
        need: ["HERO", "PACK_SHOT"],
      })
    );
    expect(res.status).toBe(201);
    const task = await prisma().task.findUnique({ where: { id: res.body.taskId } });
    expect(task.kind).toBe("MEDIA");
    expect(task.title).toContain("Indomie");
  });
});

describe("order.confirmed is recorded, not swallowed", () => {
  it("records it and says which store it is waiting on", async () => {
    const store = await prisma().organization.create({
      data: {
        kind: "STORE",
        name: "Ikeja City Mart",
        slug: `ikeja-city-mart-${Date.now()}`,
        status: "ACTIVE",
        address: "Ikeja City Mall, Alausa",
      },
    });
    const res = await postSigned(
      evt("order.confirmed", {
        martOrderId: `AZM-${Date.now()}`,
        fulfilment: { storeSlug: store.slug, stockSource: "CONSIGNMENT" },
        dropoff: { address: "14 Adeniran Ogunsanya, Surulere" },
      })
    );
    // 201: the order is live. No task yet - the shop has to accept first - so
    // the note says what it is waiting on rather than leaving a null taskId to
    // be read as nothing having happened.
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PROCESSED");
    expect(res.body.taskId).toBeNull();
    expect(res.body.note).toContain(store.slug);

    const row = await prisma().martEvent.findUnique({ where: { eventId: res.body.eventId } });
    expect(row.status).toBe("PROCESSED");
    // Stored base64 - see the note in martEvents.ts. Decoded here rather than
    // asserted on the raw column, so the test breaks if the encoding changes
    // rather than if the storage format does.
    expect(JSON.stringify(decodePayload(row.payload))).toContain("martOrderId");
  });

  it("still records one it cannot act on, rather than losing it", async () => {
    // The ledger is not only for deferred work: an order naming a store that
    // does not exist is refused, and the refusal is on the record with the
    // reason, so "Mart never sent it" and "we could not place it" stay
    // different answers.
    const res = await postSigned(
      evt("order.confirmed", {
        martOrderId: `AZM-${Date.now()}`,
        fulfilment: { storeSlug: "a-shop-that-does-not-exist", stockSource: "OWN_STOCK" },
        dropoff: { address: "Somewhere" },
      })
    );
    expect(res.status).toBe(400);

    const rows = await prisma().martEvent.findMany({ where: { type: "order.confirmed", status: "FAILED" } });
    expect(rows.length).toBeGreaterThan(0);
    expect(String(rows[rows.length - 1].note)).toContain("a-shop-that-does-not-exist");
  });
});

describe("a retry is free", () => {
  it("answers 200 and does no work the second time", async () => {
    const e = evt("stock.low", { sku: `SKU-RETRY-${Date.now()}`, productName: "Retried Item" });

    const first = await postSigned(e);
    // The SAME eventId - Mart retrying after a timeout.
    const retry = await postSigned(e);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.duplicate).toBe(true);
    expect(retry.body.taskId).toBe(first.body.taskId);

    const rows = await prisma().martEvent.findMany({ where: { eventId: e.eventId } });
    expect(rows).toHaveLength(1);
    const tasks = await prisma().task.findMany({ where: { title: "Source Retried Item" } });
    expect(tasks).toHaveLength(1);
  });
});

describe("what an operator can see", () => {
  it("lists events with a tally of what happened to them", async () => {
    const admin = await createUserWithToken("SUPER_ADMIN");
    // An order naming no store at all: understood, and refused. The tally is
    // what makes that visible as something other than silence.
    await postSigned(evt("order.confirmed", { martOrderId: `AZM-OPS-${Date.now()}` }));

    const res = await apiGet("/api/admin/mart/events", admin.token);
    expect(res.status).toBe(200);
    // Without this screen, "Mart never sent it", "we de-duplicated it" and
    // "we could not place it" are indistinguishable - and each is a different
    // bug with a different fix.
    //
    // DEFERRED is no longer among the tallies any live event type produces,
    // now that delivery is built. The status is deliberately still supported:
    // the rows recorded under it before delivery shipped are real orders and
    // are still replayable, and dropping the status would erase them.
    expect(res.body.counts.FAILED).toBeGreaterThanOrEqual(1);
    expect(res.body.events.length).toBeGreaterThan(0);
  });

  it("shows what the generators will do next", async () => {
    const admin = await createUserWithToken("SUPER_ADMIN");
    const res = await apiGet("/api/admin/mart/rules", admin.token);
    expect(res.status).toBe(200);
    expect(res.body.SOURCING.fee).toBeGreaterThan(0);
    expect(res.body.STORE_AUDIT.credentialSlug).toBe("auditor-accreditation");
  });

  it("keeps the operations screen away from workers", async () => {
    const worker = await createUserWithToken("WORKER");
    expect((await apiGet("/api/admin/mart/events", worker.token)).status).toBe(403);
    expect((await apiGet("/api/admin/mart/rules", worker.token)).status).toBe(403);
  });
});

describe("rules are configurable, not compiled in", () => {
  it("uses a fee an admin has set", async () => {
    await prisma().setting.upsert({
      where: { key: "rules.MEDIA.fee" },
      update: { value: "9999" },
      create: { key: "rules.MEDIA.fee", value: "9999" },
    });
    try {
      const res = await postSigned(
        evt("listing.needs_media", {
          listingId: `LST-FEE-${Date.now()}`,
          productName: "Configurable Item",
        })
      );
      const task = await prisma().task.findUnique({ where: { id: res.body.taskId } });
      // Blueprint §5: raising a pay band should be a screen, not a deploy.
      expect(task.budget).toBe(9999);
    } finally {
      await prisma().setting.deleteMany({ where: { key: "rules.MEDIA.fee" } });
    }
  });

  it("lets an admin turn a credential gate off with an empty value", async () => {
    // An explicitly empty setting is a real answer, distinct from "not
    // configured" - which is why the reader treats them differently.
    const rule = await ruleFor("STORE_AUDIT");
    expect(rule.credentialSlug).toBe("auditor-accreditation");

    await prisma().setting.upsert({
      where: { key: "rules.STORE_AUDIT.credentialSlug" },
      update: { value: "" },
      create: { key: "rules.STORE_AUDIT.credentialSlug", value: "" },
    });
    try {
      expect((await ruleFor("STORE_AUDIT")).credentialSlug).toBe("");
    } finally {
      await prisma().setting.deleteMany({ where: { key: "rules.STORE_AUDIT.credentialSlug" } });
    }
  });
});
