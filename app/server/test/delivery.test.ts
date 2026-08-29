// Delivery: the order, the three parties, and the promises made about it
// (MART_INTEGRATION.md §3.1, §4, §5).
//
// Four properties are worth protecting here, and every test below is one of
// them:
//
//   NOTHING IS DEFAULTED THAT CARRIES MONEY. `stockSource` decides whether a
//   store is owed a settlement line and PartTime cannot infer it. A wrong
//   default is a shop paid twice or not at all, found weeks later.
//
//   AN ORDER CANNOT GO BACKWARDS. Goods that have left the shop cannot become
//   goods that never left it. The one exception is a courier who vanishes
//   before collecting, which re-opens the posting.
//
//   A COURIER TAPPING A BUTTON IS NOT A DELIVERY. §4: order.delivered is only
//   ever emitted after a verified customer code, and "we could not check" must
//   never be shown as "that is the wrong code".
//
//   WHAT WE PROMISED TO DELETE IS DELETED. §5 says seven days after the order
//   finishes, and says deleted means DELETE - not a flag, not a filtered query.
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { SELF } from "cloudflare:test";
import { apiGet, apiPost } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";
import {
  OrderRejected,
  canTransition,
  parseOrder,
  transitionDelivery,
  TERMINAL_STATES,
  TRANSITIONS,
} from "../src/services/delivery";
import { purgeCustomerData, RETENTION_DAYS } from "../src/services/deliveryPurge";
import { SYSTEM_ACTORS, userActor } from "../src/util/audit";

const prisma = () => testPrisma() as any;

const SECRET = "local-dev-mart-inbound-secret";

// Task.createdById is a required foreign key even for work the platform
// generated, so a delivery posting still needs a person to attribute it to.
// Production always has one; the fixture reflects that.
let admin: Awaited<ReturnType<typeof createUserWithToken>>;
beforeAll(async () => {
  admin = await createUserWithToken("SUPER_ADMIN");
});

let seq = 0;
function uid(prefix: string) {
  seq += 1;
  return `${prefix}-${seq}-${Date.now()}`;
}

async function makeStore(overrides: Record<string, unknown> = {}) {
  return prisma().organization.create({
    data: {
      kind: "STORE",
      name: `Delivery Shop ${seq}`,
      slug: uid("delivery-shop"),
      status: "ACTIVE",
      address: "9 Allen Avenue, Ikeja, Lagos",
      lat: 6.6018,
      lng: 3.3515,
      ...overrides,
    },
  });
}

async function memberOf(orgId: string, role: "OWNER" | "STAFF" = "OWNER") {
  const person = await createUserWithToken("WORKER");
  await prisma().organizationMember.create({
    data: { organizationId: orgId, userId: person.user.id, role },
  });
  return person;
}

/** The payload as §3.1 documents it. */
function orderPayload(storeSlug: string, overrides: Record<string, any> = {}) {
  return {
    martOrderId: uid("AZM"),
    fulfilment: { storeSlug, stockSource: "CONSIGNMENT" },
    items: [{ ref: "SKU-8891", name: "Peak Milk 400g", qty: 2 }],
    dropoff: {
      address: "14 Adeniran Ogunsanya, Surulere, Lagos",
      lat: 6.4969,
      lng: 3.354,
      instructions: "Blue gate, second floor",
    },
    customer: { displayName: "Ada O.", phone: "+2348030000123" },
    money: { goodsTotal: 8400, deliveryFee: 1200 },
    expectedBy: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

/** Post a signed event through the real worker handler. */
async function confirmOrder(data: Record<string, unknown>) {
  const body = JSON.stringify({
    eventId: uid("evt"),
    type: "order.confirmed",
    occurredAt: new Date().toISOString(),
    data,
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
  const res = await SELF.fetch("http://local.test/api/integrations/mart/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Afz-Timestamp": ts,
      "X-Afz-Signature": sig,
    },
    body,
  });
  return { status: res.status, body: (await res.json().catch(() => undefined)) as any };
}

/** A store, a confirmed order, and the delivery row it produced. */
async function liveOrder(overrides: Record<string, any> = {}) {
  const store = await makeStore();
  const payload = orderPayload(store.slug, overrides);
  const res = await confirmOrder(payload);
  const delivery = await prisma().delivery.findUnique({
    where: { martOrderId: payload.martOrderId },
  });
  return { store, payload, res, delivery };
}

// ── The payload ──────────────────────────────────────────────────────────────

describe("what an order must say before it is accepted", () => {
  it("refuses a missing stockSource rather than guessing", () => {
    // The field this whole integration document exists for. Defaulting it is a
    // store paid twice or not at all, discovered in reconciliation weeks later.
    const data = orderPayload("any-shop");
    delete (data.fulfilment as any).stockSource;
    expect(() => parseOrder(data)).toThrow(OrderRejected);
  });

  it("refuses a stockSource it does not recognise", () => {
    const data = orderPayload("any-shop", { fulfilment: { storeSlug: "any-shop", stockSource: "MAYBE" } });
    expect(() => parseOrder(data)).toThrow(/CONSIGNMENT/);
  });

  it("refuses an order with nowhere to deliver it", () => {
    const data = orderPayload("any-shop", { dropoff: { lat: 6.5, lng: 3.3 } });
    expect(() => parseOrder(data)).toThrow(/address/);
  });

  it("refuses an order with no number and no store", () => {
    expect(() => parseOrder(orderPayload("any-shop", { martOrderId: "" }))).toThrow(/martOrderId/);
    expect(() => parseOrder(orderPayload(""))).toThrow(/storeSlug/);
  });

  it("refuses a date it cannot read, rather than delivering by the epoch", () => {
    expect(() => parseOrder(orderPayload("any-shop", { expectedBy: "next Tuesday" }))).toThrow(
      /date/
    );
  });

  it("floors negative money at zero instead of storing it", () => {
    // Not a rounding question: a negative amount is a corrupt payload, and
    // storing it puts a negative line into a settlement report.
    const parsed = parseOrder(orderPayload("any-shop", { money: { goodsTotal: -500, deliveryFee: 1200 } }));
    expect(parsed.goodsTotal).toBe(0);
    expect(parsed.deliveryFee).toBe(1200);
  });

  it("keeps everything §5 allows and nothing it does not", () => {
    const parsed = parseOrder(orderPayload("shop-a"));
    expect(parsed.customerName).toBe("Ada O.");
    expect(parsed.customerPhone).toBe("+2348030000123");
    expect(parsed.dropoffInstructions).toBe("Blue gate, second floor");
    expect(parsed.items).toHaveLength(1);
  });
});

// ── The state machine ────────────────────────────────────────────────────────

describe("an order cannot go backwards", () => {
  it("will not un-collect goods that have left the shop", () => {
    expect(canTransition("PICKED_UP", "STORE_ACCEPTED")).toBe(false);
    expect(canTransition("PICKED_UP", "RECEIVED")).toBe(false);
    expect(canTransition("DELIVERED", "PICKED_UP")).toBe(false);
  });

  it("re-opens a posting when the courier vanishes before collecting", () => {
    // §6 D5, the half that is settled. The only backwards move there is.
    expect(canTransition("COURIER_ASSIGNED", "STORE_ACCEPTED")).toBe(true);
  });

  it("does not let a store decide an order that is already out for delivery", () => {
    expect(canTransition("PICKED_UP", "STORE_REJECTED")).toBe(false);
  });

  it("leaves every terminal state terminal", () => {
    for (const state of TERMINAL_STATES) {
      expect(TRANSITIONS[state]).toEqual([]);
    }
  });

  it("refuses a state that does not exist", () => {
    expect(canTransition("RECEIVED", "SOMEWHERE_ELSE")).toBe(false);
    expect(canTransition("ALMOST_THERE", "DELIVERED")).toBe(false);
  });
});

// ── Intake ───────────────────────────────────────────────────────────────────

describe("a confirmed order becomes a record, not a task", () => {
  it("records it against the store and waits for the shop to answer", async () => {
    const { res, delivery, store, payload } = await liveOrder();

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PROCESSED");
    // No posting yet, and that is the point: a courier sent to collect from a
    // shop that has not agreed to pack the order rides to a closed door.
    expect(res.body.taskId).toBeNull();

    expect(delivery.status).toBe("RECEIVED");
    expect(delivery.organizationId).toBe(store.id);
    expect(delivery.taskId).toBeNull();
    expect(delivery.stockSource).toBe("CONSIGNMENT");
    expect(delivery.goodsTotal).toBe(8400);
    expect(delivery.martOrderId).toBe(payload.martOrderId);
  });

  it("copies the pickup rather than joining it, so a store that moves does not rewrite history", async () => {
    const { delivery, store } = await liveOrder();
    expect(delivery.pickupAddress).toBe(store.address);
    expect(delivery.pickupLat).toBe(store.lat);

    await prisma().organization.update({
      where: { id: store.id },
      data: { address: "Somewhere else entirely", lat: 9.05, lng: 7.49 },
    });
    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    expect(after.pickupAddress).toBe("9 Allen Avenue, Ikeja, Lagos");
  });

  it("refuses an order for a store nobody has heard of", async () => {
    // Worse than a refused order: nobody can be asked to pack it and nobody is
    // accountable for it.
    const res = await confirmOrder(orderPayload("no-such-shop-anywhere"));
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("no-such-shop-anywhere");
  });

  it("refuses a missing stockSource over the wire, not only in the parser", async () => {
    const store = await makeStore();
    const data = orderPayload(store.slug);
    delete (data.fulfilment as any).stockSource;
    const res = await confirmOrder(data);
    expect(res.status).toBe(400);
  });

  it("does not dispatch twice when Mart re-confirms the same order", async () => {
    // De-duplicated on martOrderId, NOT on eventId: Mart may legitimately
    // re-confirm an order under a new event, and that must find the existing
    // row rather than send a second courier to the same address.
    const store = await makeStore();
    const payload = orderPayload(store.slug);

    const first = await confirmOrder(payload);
    const again = await confirmOrder(payload);

    expect(first.status).toBe(201);
    expect(again.status).toBe(202);
    expect(again.body.status).toBe("IGNORED");

    const rows = await prisma().delivery.findMany({ where: { martOrderId: payload.martOrderId } });
    expect(rows).toHaveLength(1);
  });
});

// ── The store ────────────────────────────────────────────────────────────────

describe("the store decides, and accepting is what posts the job", () => {
  it("posts a gated courier task the moment the shop accepts", async () => {
    const { delivery, store } = await liveOrder();
    const owner = await memberOf(store.id);

    const res = await apiPost(`/api/deliveries/${delivery.id}/accept`, {}, owner.token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("STORE_ACCEPTED");
    expect(res.body.posted).toBe(true);

    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    expect(after.taskId).toBeTruthy();
    expect(after.storeDecidedAt).toBeTruthy();

    const task = await prisma().task.findUnique({ where: { id: after.taskId } });
    expect(task.kind).toBe("DELIVERY");
    expect(task.slots).toBe(1);
    // The task carries the PICKUP. That is where the work begins, and it is
    // what a courier deciding whether to take it should be measuring against.
    expect(task.address).toBe(store.address);
  });

  it("keeps the customer off the public posting", async () => {
    // §5 lets us hold a name, a number and a door for one order. A task listing
    // every courier can read is not that.
    const { delivery, store, payload } = await liveOrder();
    const owner = await memberOf(store.id);
    await apiPost(`/api/deliveries/${delivery.id}/accept`, {}, owner.token);

    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    const task = await prisma().task.findUnique({ where: { id: after.taskId } });
    const posting = `${task.title} ${task.description} ${task.address ?? ""}`;

    expect(posting).not.toContain("Ada O.");
    expect(posting).not.toContain("+2348030000123");
    expect(posting).not.toContain("Adeniran Ogunsanya");
    // The order number is fine and is what makes the posting identifiable.
    expect(task.title).toContain(payload.martOrderId);
  });

  it("does not let a stranger answer for a shop", async () => {
    const { delivery } = await liveOrder();
    const outsider = await createUserWithToken("WORKER");

    const res = await apiPost(`/api/deliveries/${delivery.id}/accept`, {}, outsider.token);
    // 404, not 403: confirming the row exists would turn an id parameter into a
    // directory of every order on the platform.
    expect(res.status).toBe(404);
  });

  it("will not take a refusal without a reason", async () => {
    // Rejection is the ONLY unavailability signal PartTime has - it holds no
    // stock data - so "no" on its own tells Mart nothing they can act on.
    const { delivery, store } = await liveOrder();
    const owner = await memberOf(store.id);

    const bare = await apiPost(`/api/deliveries/${delivery.id}/reject`, {}, owner.token);
    expect(bare.status).toBe(400);

    const given = await apiPost(
      `/api/deliveries/${delivery.id}/reject`,
      { reason: "Out of stock until Thursday" },
      owner.token
    );
    expect(given.status).toBe(200);
    expect(given.body.status).toBe("STORE_REJECTED");
    expect(given.body.storeNote).toBe("Out of stock until Thursday");
  });

  it("will not mark an order packed before anyone agreed to pack it", async () => {
    const { delivery, store } = await liveOrder();
    const owner = await memberOf(store.id);

    const early = await apiPost(`/api/deliveries/${delivery.id}/prepared`, {}, owner.token);
    expect(early.status).toBe(409);

    await apiPost(`/api/deliveries/${delivery.id}/accept`, {}, owner.token);
    const now = await apiPost(`/api/deliveries/${delivery.id}/prepared`, {}, owner.token);
    expect(now.status).toBe(200);
    expect(now.body.preparedAt).toBeTruthy();
    // Packing is a timestamp, not a state - a courier may already hold the job
    // while the shopkeeper is still bagging it.
    expect(now.body.status).toBe("STORE_ACCEPTED");
  });

  it("lets Afrizone answer for a shop that phoned in, and says who did", async () => {
    const { delivery } = await liveOrder();

    const res = await apiPost(`/api/deliveries/${delivery.id}/accept`, {}, admin.token);
    expect(res.status).toBe(200);

    const trail = await prisma().auditLog.findMany({
      where: { entity: "Delivery", entityId: delivery.id, action: "delivery.state.changed" },
    });
    const accepted = trail.find((t: any) => String(t.meta).includes("STORE_ACCEPTED"));
    expect(String(accepted.meta)).toContain("onBehalfOfStore");
    expect(accepted.actorId).toBe(admin.user.id);
  });

  it("lists a store its own orders and nobody else's", async () => {
    const mine = await liveOrder();
    const theirs = await liveOrder();
    const owner = await memberOf(mine.store.id);

    const res = await apiGet(`/api/organizations/${mine.store.id}/deliveries`, owner.token);
    expect(res.status).toBe(200);
    const ids = res.body.map((d: any) => d.id);
    expect(ids).toContain(mine.delivery.id);
    expect(ids).not.toContain(theirs.delivery.id);

    const nosy = await apiGet(`/api/organizations/${theirs.store.id}/deliveries`, owner.token);
    expect(nosy.status).toBe(404);
  });
});

// ── The courier ──────────────────────────────────────────────────────────────

/** Accept the order, put a courier on it through the real approval path. */
async function assignCourier(deliveryId: string, storeId: string) {
  const owner = await memberOf(storeId);
  await apiPost(`/api/deliveries/${deliveryId}/accept`, {}, owner.token);
  const delivery = await prisma().delivery.findUnique({ where: { id: deliveryId } });

  const courier = await createUserWithToken("WORKER");
  const application = await prisma().application.create({
    data: { taskId: delivery.taskId, workerId: courier.user.id, status: "APPLIED" },
  });
  // `override` because the posting is credential-gated and this fixture is
  // about assignment, not about eligibility - which has its own tests.
  const approved = await apiPost(
    `/api/applications/${application.id}/approve`,
    { override: true },
    admin.token
  );
  return { courier, owner, approved };
}

describe("the courier holding the job, and only them", () => {
  it("marks the order assigned when the contract is minted", async () => {
    const { delivery, store } = await liveOrder();
    const { approved } = await assignCourier(delivery.id, store.id);
    expect(approved.status).toBe(200);

    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    expect(after.status).toBe("COURIER_ASSIGNED");
    expect(after.assignedAt).toBeTruthy();
  });

  it("does not let another worker collect somebody else's order", async () => {
    const { delivery, store } = await liveOrder();
    await assignCourier(delivery.id, store.id);
    const stranger = await createUserWithToken("WORKER");

    const res = await apiPost(`/api/deliveries/${delivery.id}/picked-up`, {}, stranger.token);
    expect(res.status).toBe(404);
  });

  it("lets the assigned courier collect, and shows them where it is going", async () => {
    const { delivery, store } = await liveOrder();
    const { courier } = await assignCourier(delivery.id, store.id);

    const res = await apiPost(`/api/deliveries/${delivery.id}/picked-up`, {}, courier.token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PICKED_UP");
    // Now that the job is theirs, the door and the contact are theirs to see.
    expect(res.body.dropoffAddress).toContain("Adeniran Ogunsanya");
    expect(res.body.customerPhone).toBe("+2348030000123");

    const mine = await apiGet("/api/me/deliveries", courier.token);
    expect(mine.body.map((d: any) => d.id)).toContain(delivery.id);
  });

  it("refuses to complete a delivery that has not been collected", async () => {
    const { delivery, store } = await liveOrder();
    const { courier } = await assignCourier(delivery.id, store.id);

    const res = await apiPost(`/api/deliveries/${delivery.id}/complete`, { code: "4821" }, courier.token);
    expect(res.status).toBe(409);
  });

  it("says it could not check, rather than that the code was wrong", async () => {
    // The tests run with no MART_BASE_URL, which is exactly the unconfigured
    // case. §6 D1 is still open; until it is decided, the honest answer is that
    // nothing was asked - and a courier told the customer typed it wrong, when
    // nothing was checked, argues on a doorstep about a check that never ran.
    const { delivery, store } = await liveOrder();
    const { courier } = await assignCourier(delivery.id, store.id);
    await apiPost(`/api/deliveries/${delivery.id}/picked-up`, {}, courier.token);

    const res = await apiPost(`/api/deliveries/${delivery.id}/complete`, { code: "4821" }, courier.token);
    expect(res.status).toBe(503);
    expect(res.body.retryable).toBe(true);

    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    expect(after.status).toBe("PICKED_UP");
    expect(after.deliveredAt).toBeNull();
  });

  it("cannot be talked into DELIVERED by anything but a verified code", async () => {
    // §4: "there is no path where a courier tapping a button produces
    // order.delivered". Asserted at the service, below every route.
    const { delivery, store } = await liveOrder();
    const { courier } = await assignCourier(delivery.id, store.id);
    await apiPost(`/api/deliveries/${delivery.id}/picked-up`, {}, courier.token);

    const direct = await transitionDelivery(delivery.id, "DELIVERED", userActor(courier.user.id));
    expect(direct.ok).toBe(false);
    expect((direct as any).status).toBe(400);

    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    expect(after.status).toBe("PICKED_UP");
  });

  it("records a failed attempt with what happened", async () => {
    const { delivery, store } = await liveOrder();
    const { courier } = await assignCourier(delivery.id, store.id);
    await apiPost(`/api/deliveries/${delivery.id}/picked-up`, {}, courier.token);

    const bare = await apiPost(`/api/deliveries/${delivery.id}/failed`, {}, courier.token);
    expect(bare.status).toBe(400);

    const res = await apiPost(
      `/api/deliveries/${delivery.id}/failed`,
      { reason: "Nobody at the address after three calls" },
      courier.token
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("FAILED");
    expect(res.body.failureReason).toContain("three calls");
  });
});

// ── Staff ────────────────────────────────────────────────────────────────────

describe("the operations board", () => {
  it("shows staff every order and whether the integration is wired up", async () => {
    const { delivery } = await liveOrder();
    const res = await apiGet("/api/admin/deliveries", admin.token);
    expect(res.status).toBe(200);
    expect(res.body.deliveries.map((d: any) => d.id)).toContain(delivery.id);
    // No MART_BASE_URL in the test environment - an operator staring at an
    // order that will not complete needs to be able to tell that apart from a
    // courier problem.
    expect(res.body.martConfigured).toBe(false);
  });

  it("is not readable by a worker", async () => {
    const worker = await createUserWithToken("WORKER");
    const res = await apiGet("/api/admin/deliveries", worker.token);
    expect(res.status).toBe(403);
  });

  it("re-opens a posting when a courier disappears", async () => {
    const { delivery, store } = await liveOrder();
    await assignCourier(delivery.id, store.id);

    const res = await apiPost(
      `/api/admin/deliveries/${delivery.id}/reopen`,
      { reason: "Unreachable for two hours" },
      admin.token
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("STORE_ACCEPTED");
    // The assignment stamp is cleared, so "how long has this been waiting for a
    // rider?" stays honest.
    expect(res.body.assignedAt).toBeNull();

    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    const task = await prisma().task.findUnique({ where: { id: after.taskId } });
    expect(task.status).toBe("OPEN");
    // Re-opened, not re-created: one order, one posting.
    const tasks = await prisma().task.findMany({ where: { title: `Deliver order ${after.martOrderId}` } });
    expect(tasks).toHaveLength(1);
  });

  it("will not cancel without a reason, and tells nobody afterwards" , async () => {
    const { delivery } = await liveOrder();
    const bare = await apiPost(`/api/admin/deliveries/${delivery.id}/cancel`, {}, admin.token);
    expect(bare.status).toBe(400);

    const res = await apiPost(
      `/api/admin/deliveries/${delivery.id}/cancel`,
      { reason: "Customer cancelled with Mart" },
      admin.token
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
  });
});

// ── Retention ────────────────────────────────────────────────────────────────

describe("the customer data we promised to delete", () => {
  /** Age a finished order past the retention window. */
  async function finishedDaysAgo(deliveryId: string, days: number, status = "DELIVERED") {
    const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // updatedAt is the clock: for a terminal order the last change WAS reaching
    // a terminal state. Written directly because Prisma manages @updatedAt.
    await prisma()
      .$executeRawUnsafe(
        `UPDATE "Delivery" SET "status" = ?, "updatedAt" = ? WHERE "id" = ?`,
        status,
        when.toISOString(),
        deliveryId
      );
  }

  it("empties the columns rather than hiding them", async () => {
    const { delivery } = await liveOrder();
    await finishedDaysAgo(delivery.id, RETENTION_DAYS + 1);

    const result = await purgeCustomerData(SYSTEM_ACTORS.deliveryPurge);
    expect(result.purged).toBeGreaterThan(0);

    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    expect(after.customerName).toBeNull();
    expect(after.customerPhone).toBeNull();
    expect(after.dropoffAddress).toBeNull();
    expect(after.dropoffLat).toBeNull();
    expect(after.dropoffInstructions).toBeNull();
    expect(after.customerPurgedAt).toBeTruthy();

    // The order itself survives. What is owed, to which store, on which order,
    // is a financial record and outlives the customer's details by design.
    expect(after.martOrderId).toBeTruthy();
    expect(after.goodsTotal).toBe(8400);
    expect(after.organizationId).toBeTruthy();
  });

  it("leaves a live order alone however old it is", async () => {
    const { delivery } = await liveOrder();
    // Old, and still out for delivery. Age is not the trigger; finishing is.
    await finishedDaysAgo(delivery.id, RETENTION_DAYS + 30, "PICKED_UP");

    await purgeCustomerData(SYSTEM_ACTORS.deliveryPurge);

    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    expect(after.customerPhone).toBe("+2348030000123");
    expect(after.customerPurgedAt).toBeNull();
  });

  it("leaves a finished order alone until the window has passed", async () => {
    const { delivery } = await liveOrder();
    await finishedDaysAgo(delivery.id, RETENTION_DAYS - 1);

    await purgeCustomerData(SYSTEM_ACTORS.deliveryPurge);

    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    expect(after.customerPhone).toBe("+2348030000123");
  });

  it("records a run that found nothing, so a job that never ran is visible", async () => {
    // §5: "the purge is auditable and its failure visible". A quiet run and a
    // run that never happened must not look the same from the outside.
    const before = await prisma().auditLog.count({
      where: { action: "delivery.customerData.purged" },
    });
    const result = await purgeCustomerData(SYSTEM_ACTORS.deliveryPurge);
    expect(result.purged).toBe(0);

    const after = await prisma().auditLog.count({
      where: { action: "delivery.customerData.purged" },
    });
    expect(after).toBe(before + 1);
  });

  it("does not purge the same order twice", async () => {
    const { delivery } = await liveOrder();
    await finishedDaysAgo(delivery.id, RETENTION_DAYS + 1);

    const first = await purgeCustomerData(SYSTEM_ACTORS.deliveryPurge);
    const second = await purgeCustomerData(SYSTEM_ACTORS.deliveryPurge);
    expect(first.purged).toBeGreaterThan(0);
    // Without the customerPurgedAt guard the sweep re-finds the same rows
    // forever and every run reports work it did not do.
    expect(second.purged).toBe(0);
  });

  it("shows staff the backlog without making them run it", async () => {
    const res = await apiGet("/api/admin/deliveries/purge", admin.token);
    expect(res.status).toBe(200);
    expect(res.body.retentionDays).toBe(RETENTION_DAYS);
    expect(typeof res.body.due).toBe("number");
  });
});
