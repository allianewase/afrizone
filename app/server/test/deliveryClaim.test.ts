// Self-claim, and what happens when nobody claims (MART_INTEGRATION.md §6 D4).
//
// Assignment on this platform has always been an admin approving an
// application. That is right for a week-long task and much too slow for an
// order that has to move within the hour, so a qualified courier near the shop
// may now take a delivery posting themselves.
//
// Five properties are worth protecting, and every test below is one of them:
//
//   TWO COURIERS TAPPING AT ONCE PRODUCE ONE ASSIGNMENT. Not a rare case - it
//   is what a good posting looks like. The slot latch is the only genuinely
//   atomic thing in the assignment path and the tests treat it that way.
//
//   CLAIMING AND APPROVING PRODUCE THE SAME THING. One contract, one
//   commitment, one order status move, from one function. The comment that used
//   to sit in routes/applications.ts warned that a second assignment path
//   "would eventually disagree with this one about who holds a job"; these
//   tests are what keeps that from happening.
//
//   THE CIRCLE WIDENS, AND STOPS. A courier too far away now may be close
//   enough in four minutes, and is told so. One who will never be in range is
//   not promised anything.
//
//   A REFUSAL SAYS WHICH REFUSAL IT IS. Too far, not qualified, already taken
//   and switched off are four different problems. A courier given one flat
//   "cannot claim" will tap it again on a job that will never be theirs.
//
//   NOTHING ABOUT THE CUSTOMER LEAVES BEFORE THE JOB IS TAKEN. §5 gives the
//   name, number and door to the courier holding the order. A list of jobs
//   nobody has taken is not that.
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { SELF } from "cloudflare:test";
import { apiGet, apiPost } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";
import {
  DEFAULT_OFFER_RULE,
  minutesUntilInRange,
  offerStateAt,
  reach,
  type OfferRule,
} from "../src/services/deliveryOffer";
import { assignWorker } from "../src/services/assignment";
import { userActor } from "../src/util/audit";

const prisma = () => testPrisma() as any;

const SECRET = "local-dev-mart-inbound-secret";
const MINUTE = 60_000;

// The shop the fixtures deliver from: Allen Avenue, Ikeja.
const SHOP = { lat: 6.6018, lng: 3.3515 };
// Due south of the shop, about 8 km: outside the 3 km opening circle, inside
// the 15 km cap. This is the courier the widening is FOR - close enough that
// waiting brings them in.
const EIGHT_KM = { lat: 6.5299, lng: 3.3515 };
// Lekki Phase 1, about 21 km away - beyond even the widest circle this order
// will ever reach. Being told no is the right answer for them.
const BEYOND_CAP = { lat: 6.4478, lng: 3.4723 };

let admin: Awaited<ReturnType<typeof createUserWithToken>>;
beforeAll(async () => {
  admin = await createUserWithToken("SUPER_ADMIN");
  // The credential gate has its own 24 tests in eligibility.test.ts. These are
  // about assignment, and self-claim has no override to lean on the way the
  // admin fixture in delivery.test.ts does - so the gate is switched off and
  // couriers are given the DISPATCH tier, which enforces regardless.
  await prisma().setting.upsert({
    where: { key: "eligibility.enforce" },
    create: { key: "eligibility.enforce", value: "off" },
    update: { value: "off" },
  });
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
      name: `Claim Shop ${seq}`,
      slug: uid("claim-shop"),
      status: "ACTIVE",
      address: "9 Allen Avenue, Ikeja, Lagos",
      lat: SHOP.lat,
      lng: SHOP.lng,
      ...overrides,
    },
  });
}

async function memberOf(orgId: string) {
  const person = await createUserWithToken("WORKER");
  await prisma().organizationMember.create({
    data: { organizationId: orgId, userId: person.user.id, role: "OWNER" },
  });
  return person;
}

/** A courier the tier check will accept. */
async function makeCourier() {
  const c = await createUserWithToken("WORKER");
  await prisma().user.update({
    where: { id: c.user.id },
    data: { tiers: "DISPATCH", kycStatus: "VERIFIED", accountType: "COURIER" },
  });
  return c;
}

/** The payload as §3.1 documents it. */
function orderPayload(storeSlug: string, overrides: Record<string, any> = {}) {
  return {
    martOrderId: uid("AZM"),
    fulfilment: { storeSlug, stockSource: "OWN_STOCK" },
    items: [{ ref: "SKU-1120", name: "Rice 5kg", qty: 1 }],
    dropoff: {
      address: "14 Opebi Road, Ikeja, Lagos",
      lat: 6.5921,
      lng: 3.3489,
      instructions: "Blue gate",
    },
    customer: { displayName: "Ada O.", phone: "+2348030000123" },
    money: { goodsTotal: 12000, deliveryFee: 1500 },
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

/**
 * An order a store has accepted, so the courier posting is up and `offeredAt`
 * is stamped. This is the state every test below starts from.
 */
async function offeredOrder() {
  const store = await makeStore();
  const payload = orderPayload(store.slug);
  await confirmOrder(payload);

  const owner = await memberOf(store.id);
  const delivery = await prisma().delivery.findUnique({
    where: { martOrderId: payload.martOrderId },
  });
  await apiPost(`/api/deliveries/${delivery.id}/accept`, {}, owner.token);

  return {
    store,
    owner,
    delivery: await prisma().delivery.findUnique({
      where: { martOrderId: payload.martOrderId },
    }),
  };
}

/** Move a posting's clock back, so a widened circle can be tested without waiting. */
async function waitedMinutes(deliveryId: string, minutes: number) {
  await prisma().delivery.update({
    where: { id: deliveryId },
    data: { offeredAt: new Date(Date.now() - minutes * MINUTE) },
  });
}

async function setOfferRule(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    await prisma().setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}

// ── The policy, as arithmetic ────────────────────────────────────────────────

describe("the circle a delivery is offered in", () => {
  const rule: OfferRule = DEFAULT_OFFER_RULE;
  const now = new Date("2026-08-31T12:00:00Z");
  const ago = (m: number) => new Date(now.getTime() - m * MINUTE);

  it("starts at the base radius and doubles on the timer", () => {
    expect(offerStateAt(ago(0), now, rule)!.radiusMetres).toBe(3_000);
    expect(offerStateAt(ago(4), now, rule)!.radiusMetres).toBe(3_000);
    expect(offerStateAt(ago(5), now, rule)!.radiusMetres).toBe(6_000);
    expect(offerStateAt(ago(10), now, rule)!.radiusMetres).toBe(12_000);
  });

  it("stops widening at the cap rather than growing forever", () => {
    // Beyond a point "nearby" stops meaning anything, and the honest answer is
    // that nobody is coming - which is what escalation is for, not a circle
    // that eventually covers the country.
    expect(offerStateAt(ago(15), now, rule)!.radiusMetres).toBe(15_000);
    expect(offerStateAt(ago(600), now, rule)!.radiusMetres).toBe(15_000);
    expect(offerStateAt(ago(600), now, rule)!.atMaxRadius).toBe(true);
  });

  it("escalates on time waited, not on how wide the circle got", () => {
    // These are two different facts. The circle stops at 15 minutes; the board
    // is not asked to look until 20.
    expect(offerStateAt(ago(15), now, rule)!.escalated).toBe(false);
    expect(offerStateAt(ago(15), now, rule)!.stage).toBe("WIDENED");
    expect(offerStateAt(ago(20), now, rule)!.escalated).toBe(true);
    expect(offerStateAt(ago(20), now, rule)!.stage).toBe("ESCALATED");
  });

  it("returns nothing for an order that is not on the board", () => {
    // Null offeredAt means the store has not accepted, or a courier already
    // holds it. That is not a circle of zero, which would render as a live
    // offer nobody on Earth is inside.
    expect(offerStateAt(null, now, rule)).toBeNull();
  });

  it("survives a misconfigured setting instead of refusing everybody", async () => {
    // A radius of NaN compares false against every distance, which would make
    // every delivery unclaimable and look exactly like an outage.
    await setOfferRule({ "rules.DELIVERY.baseRadiusMetres": "not-a-number" });
    const { offerRule } = await import("../src/services/deliveryOffer");
    const loaded = await offerRule(prisma());
    expect(loaded.baseRadiusMetres).toBe(DEFAULT_OFFER_RULE.baseRadiusMetres);
    await prisma().setting.deleteMany({ where: { key: "rules.DELIVERY.baseRadiusMetres" } });
  });
});

describe("who the circle reaches", () => {
  const rule = DEFAULT_OFFER_RULE;
  const state = offerStateAt(new Date(), new Date(), rule)!;

  it("lets in a courier inside it and keeps out one beyond it", () => {
    const near = reach(SHOP, { lat: 6.5921, lng: 3.3489 }, state);
    expect(near.inRange).toBe(true);

    // Lekki Phase 1, roughly 15 km from Ikeja.
    const far = reach(SHOP, { lat: 6.4478, lng: 3.4723 }, state);
    expect(far.inRange).toBe(false);
    expect(far.distanceMetres).toBeGreaterThan(3_000);
  });

  it("opens an un-located posting to everyone qualified", () => {
    // A real share of approved businesses have never had coordinates set - the
    // admin map counts them on its own screen. Refusing every claim on those
    // would make their orders undeliverable forever, discovered as orders
    // quietly rotting on the board. An unknown distance is not a failed check.
    const result = reach({ lat: null, lng: null }, { lat: 6.4478, lng: 3.4723 }, state);
    expect(result.inRange).toBe(true);
    expect(result.distanceMetres).toBeNull();
  });

  it("tells a courier with no location apart from one who is too far", () => {
    const result = reach(SHOP, { lat: undefined, lng: undefined }, state);
    expect(result.inRange).toBe(false);
    // Infinity rather than a number, so the route can say "turn on location"
    // instead of "you are 4 km away", which would be a made-up distance.
    expect(Number.isFinite(result.distanceMetres as number)).toBe(false);
  });

  it("says when the circle will reach somebody, and when it never will", () => {
    const offeredAt = new Date();
    const now = offeredAt;
    // 5 km: needs one doubling, which is one step away.
    expect(minutesUntilInRange(5_000, offeredAt, now, rule)).toBe(5);
    // Inside the first circle already.
    expect(minutesUntilInRange(2_000, offeredAt, now, rule)).toBe(0);
    // Beyond the cap. Null, not a large number - a promise that never comes
    // true is worse than being told no.
    expect(minutesUntilInRange(40_000, offeredAt, now, rule)).toBeNull();
  });
});

// ── Claiming ─────────────────────────────────────────────────────────────────

describe("a courier taking a delivery", () => {
  it("assigns the order, mints the contract and moves it off the board", async () => {
    const { delivery } = await offeredOrder();
    const courier = await makeCourier();

    const res = await apiPost(
      `/api/deliveries/${delivery.id}/claim`,
      { lat: 6.5921, lng: 3.3489 },
      courier.token
    );
    expect(res.status).toBe(201);
    expect(res.body.contractId).toBeTruthy();

    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    expect(after.status).toBe("COURIER_ASSIGNED");
    expect(after.assignedAt).toBeTruthy();
    // Cleared, or the operations board would go on counting how long an order
    // somebody is already carrying has been waiting for a rider.
    expect(after.offeredAt).toBeNull();

    const contract = await prisma().contract.findFirst({
      where: { taskId: delivery.taskId, workerId: courier.user.id },
    });
    expect(contract.status).toBe("CLAIMED");

    const task = await prisma().task.findUnique({ where: { id: delivery.taskId } });
    expect(task.status).toBe("FILLED");
  });

  it("produces exactly what an admin approval produces", async () => {
    // The property the shared assignment path exists for. If these two ever
    // disagree, two parts of the platform disagree about who holds a job.
    const claimed = await offeredOrder();
    const courierA = await makeCourier();
    await apiPost(
      `/api/deliveries/${claimed.delivery.id}/claim`,
      { lat: SHOP.lat, lng: SHOP.lng },
      courierA.token
    );

    const approved = await offeredOrder();
    const courierB = await makeCourier();
    const application = await prisma().application.create({
      data: { taskId: approved.delivery.taskId, workerId: courierB.user.id, status: "APPLIED" },
    });
    await apiPost(`/api/applications/${application.id}/approve`, {}, admin.token);

    for (const [d, courier] of [
      [claimed.delivery, courierA],
      [approved.delivery, courierB],
    ] as const) {
      const row = await prisma().delivery.findUnique({ where: { id: d.id } });
      expect(row.status).toBe("COURIER_ASSIGNED");

      const app = await prisma().application.findFirst({
        where: { taskId: d.taskId, workerId: courier.user.id },
      });
      expect(app.status).toBe("APPROVED");
      // The frozen record of what was true at assignment. Credentials expire,
      // so "were they eligible at the time?" is otherwise unanswerable later -
      // which is exactly the question asked when a job goes wrong weeks on.
      expect(app.eligibilitySnapshot).toBeTruthy();

      const contract = await prisma().contract.findFirst({
        where: { taskId: d.taskId, workerId: courier.user.id },
      });
      expect(contract.status).toBe("CLAIMED");

      const commitment = await prisma().commitment.findFirst({
        where: { contractId: contract.id },
      });
      expect(commitment).toBeTruthy();
    }
  });

  it("gives the job to exactly one of two couriers claiming at once", async () => {
    // AT THE SERVICE LAYER, NOT THROUGH TWO HTTP REQUESTS, and that is a
    // harness limit rather than a preference: two concurrent SELF.fetch calls
    // that both write to D1 crash the Workers runtime under
    // vitest-pool-workers ("The Workers runtime crashed unexpectedly"). The
    // latch lives in assignWorker, so this drives assignWorker - which is the
    // more direct test of it anyway. The route's own refusal path is covered by
    // the sequential case below.
    const { delivery } = await offeredOrder();
    const [a, b] = await Promise.all([makeCourier(), makeCourier()]);

    const results = await Promise.all([
      assignWorker({
        taskId: delivery.taskId,
        workerId: a.user.id,
        actor: userActor(a.user.id),
        source: "SELF_CLAIM",
      }),
      assignWorker({
        taskId: delivery.taskId,
        workerId: b.user.id,
        actor: userActor(b.user.id),
        source: "SELF_CLAIM",
      }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const lost = results.find((r) => !r.ok) as Extract<typeof results[number], { ok: false }>;
    expect(lost.status).toBe(409);
    // Named, not a generic conflict. A courier told somebody beat them to it
    // goes and looks for the next job.
    expect(lost.error).toMatch(/took this job/i);

    const contracts = await prisma().contract.findMany({ where: { taskId: delivery.taskId } });
    expect(contracts).toHaveLength(1);
  });

  it("turns the second courier away once the job is held", async () => {
    const { delivery } = await offeredOrder();
    const first = await makeCourier();
    const second = await makeCourier();

    const won = await apiPost(
      `/api/deliveries/${delivery.id}/claim`,
      { lat: SHOP.lat, lng: SHOP.lng },
      first.token
    );
    expect(won.status).toBe(201);

    const late = await apiPost(
      `/api/deliveries/${delivery.id}/claim`,
      { lat: SHOP.lat, lng: SHOP.lng },
      second.token
    );
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("NOT_AVAILABLE");

    const contracts = await prisma().contract.findMany({ where: { taskId: delivery.taskId } });
    expect(contracts).toHaveLength(1);
  });

  it("refuses a courier outside the circle, and says when it will reach them", async () => {
    const { delivery } = await offeredOrder();
    const courier = await makeCourier();

    const res = await apiPost(
      `/api/deliveries/${delivery.id}/claim`,
      EIGHT_KM,
      courier.token
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TOO_FAR");
    expect(res.body.distanceMetres).toBeGreaterThan(res.body.radiusMetres);
    expect(res.body.opensToYouInMinutes).toBeGreaterThan(0);

    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    expect(after.status).toBe("STORE_ACCEPTED");
    expect(after.offeredAt).toBeTruthy();
  });

  it("lets that same courier in once the circle has widened to them", async () => {
    const { delivery } = await offeredOrder();
    const courier = await makeCourier();
    // Two doublings: 3 km → 12 km, which reaches 8 km away.
    await waitedMinutes(delivery.id, 12);

    const res = await apiPost(`/api/deliveries/${delivery.id}/claim`, EIGHT_KM, courier.token);
    expect(res.status).toBe(201);
  });

  it("promises nothing to a courier the circle will never reach", async () => {
    const { delivery } = await offeredOrder();
    const courier = await makeCourier();
    await waitedMinutes(delivery.id, 120);

    const res = await apiPost(
      `/api/deliveries/${delivery.id}/claim`,
      BEYOND_CAP,
      courier.token
    );
    expect(res.status).toBe(403);
    // Null rather than a large number. The circle has stopped growing, so a
    // countdown here would be a promise that never comes true.
    expect(res.body.opensToYouInMinutes).toBeNull();
  });

  it("asks for location rather than inventing a distance", async () => {
    const { delivery } = await offeredOrder();
    const courier = await makeCourier();

    const res = await apiPost(`/api/deliveries/${delivery.id}/claim`, {}, courier.token);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_LOCATION");
  });

  it("refuses a courier the tier gate does not accept", async () => {
    const { delivery } = await offeredOrder();
    // No DISPATCH tier. TIER enforces even with the eligibility switch off, on
    // purpose - turning a new gate off must not delete an old check.
    const walkIn = await createUserWithToken("WORKER");

    const res = await apiPost(
      `/api/deliveries/${delivery.id}/claim`,
      { lat: SHOP.lat, lng: SHOP.lng },
      walkIn.token
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NOT_QUALIFIED");
    expect(res.body.blockers.length).toBeGreaterThan(0);
  });

  it("refuses an order the store has not accepted yet", async () => {
    const store = await makeStore();
    const payload = orderPayload(store.slug);
    await confirmOrder(payload);
    const delivery = await prisma().delivery.findUnique({
      where: { martOrderId: payload.martOrderId },
    });
    const courier = await makeCourier();

    const res = await apiPost(
      `/api/deliveries/${delivery.id}/claim`,
      { lat: SHOP.lat, lng: SHOP.lng },
      courier.token
    );
    // 404 rather than 409, and deliberately so: an unaccepted order has no
    // posting, and this router's stated posture is that a delivery a caller
    // cannot address is Not Found. Confirming the row exists would turn the id
    // parameter into a directory of every order on the platform.
    expect(res.status).toBe(404);
    // Posting a rider to collect from a shop that has not agreed to pack it
    // sends them to a closed door.
    expect(delivery.taskId).toBeNull();
  });

  it("stops entirely when self-claim is switched off", async () => {
    const { delivery } = await offeredOrder();
    const courier = await makeCourier();
    await setOfferRule({ "rules.DELIVERY.selfClaim": "off" });

    const res = await apiPost(
      `/api/deliveries/${delivery.id}/claim`,
      { lat: SHOP.lat, lng: SHOP.lng },
      courier.token
    );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SELF_CLAIM_OFF");

    // And the platform falls back to what it did before this existed, rather
    // than leaving deliveries unassignable - which is the whole point of having
    // a switch rather than a deploy.
    const application = await prisma().application.create({
      data: { taskId: delivery.taskId, workerId: courier.user.id, status: "APPLIED" },
    });
    const approved = await apiPost(
      `/api/applications/${application.id}/approve`,
      {},
      admin.token
    );
    expect(approved.status).toBe(200);

    await prisma().setting.deleteMany({ where: { key: "rules.DELIVERY.selfClaim" } });
  });
});

// ── The offers list ──────────────────────────────────────────────────────────

describe("what a courier is shown before they take anything", () => {
  it("lists an offered job with its distance and marks it claimable", async () => {
    const { delivery } = await offeredOrder();
    const courier = await makeCourier();

    const res = await apiGet(`/api/me/delivery-offers?lat=6.5921&lng=3.3489`, courier.token);
    expect(res.status).toBe(200);
    const mine = res.body.offers.find((o: any) => o.id === delivery.id);
    expect(mine).toBeTruthy();
    expect(mine.claimable).toBe(true);
    expect(mine.distance).toMatch(/m|km/);
    expect(mine.offer.stage).toBe("OFFERED");
  });

  it("never names the customer on a job nobody has taken", async () => {
    // §5: the name, the number and the door go to the courier holding the
    // order. A public list of open jobs is not that.
    const { delivery } = await offeredOrder();
    const courier = await makeCourier();

    const res = await apiGet(`/api/me/delivery-offers?lat=6.5921&lng=3.3489`, courier.token);
    const mine = res.body.offers.find((o: any) => o.id === delivery.id);
    const serialised = JSON.stringify(mine);
    expect(serialised).not.toContain("Ada");
    expect(serialised).not.toContain("2348030000123");
    expect(serialised).not.toContain("Opebi");
  });

  it("still shows the work when the phone will not say where it is", async () => {
    // An empty screen is the same screen a courier sees on a quiet afternoon,
    // and telling those apart matters to somebody deciding whether to go home.
    const { delivery } = await offeredOrder();
    const courier = await makeCourier();

    const res = await apiGet(`/api/me/delivery-offers`, courier.token);
    const mine = res.body.offers.find((o: any) => o.id === delivery.id);
    expect(mine).toBeTruthy();
    expect(mine.claimable).toBe(false);
    expect(mine.reason).toMatch(/location/i);
  });

  it("tells a courier out of range how long until the job opens to them", async () => {
    const { delivery } = await offeredOrder();
    const courier = await makeCourier();

    const res = await apiGet(
      `/api/me/delivery-offers?lat=${EIGHT_KM.lat}&lng=${EIGHT_KM.lng}`,
      courier.token
    );
    const mine = res.body.offers.find((o: any) => o.id === delivery.id);
    expect(mine.claimable).toBe(false);
    expect(mine.opensToYouInMinutes).toBeGreaterThan(0);
  });

  it("drops a job the moment somebody else holds it", async () => {
    const { delivery } = await offeredOrder();
    const taker = await makeCourier();
    const looker = await makeCourier();

    await apiPost(
      `/api/deliveries/${delivery.id}/claim`,
      { lat: SHOP.lat, lng: SHOP.lng },
      taker.token
    );

    const res = await apiGet(`/api/me/delivery-offers?lat=6.5921&lng=3.3489`, looker.token);
    expect(res.body.offers.find((o: any) => o.id === delivery.id)).toBeUndefined();
  });
});

// ── Nobody took it ───────────────────────────────────────────────────────────

describe("the order nobody claimed", () => {
  it("shows on the operations board once it has waited long enough", async () => {
    const { delivery } = await offeredOrder();
    await waitedMinutes(delivery.id, 25);

    const res = await apiGet(`/api/admin/deliveries?escalated=1`, admin.token);
    expect(res.status).toBe(200);
    const found = res.body.deliveries.find((d: any) => d.id === delivery.id);
    expect(found).toBeTruthy();
    expect(found.offer.escalated).toBe(true);
    expect(res.body.escalatedCount).toBeGreaterThan(0);
  });

  it("leaves a freshly posted order alone", async () => {
    const { delivery } = await offeredOrder();

    const res = await apiGet(`/api/admin/deliveries?escalated=1`, admin.token);
    expect(res.body.deliveries.find((d: any) => d.id === delivery.id)).toBeUndefined();
  });

  it("stays claimable while it is escalated", async () => {
    // Escalation asks a person to look. Stopping couriers from taking the job
    // at the exact moment it is agreed nobody has taken it would be perverse.
    const { delivery } = await offeredOrder();
    const courier = await makeCourier();
    await waitedMinutes(delivery.id, 30);

    const res = await apiPost(
      `/api/deliveries/${delivery.id}/claim`,
      { lat: SHOP.lat, lng: SHOP.lng },
      courier.token
    );
    expect(res.status).toBe(201);
  });

  it("starts the wait again when a vanished courier releases it", async () => {
    // §6 D5. Counting the time a courier held the order as time nobody wanted
    // the job would put a re-opened order straight into escalation at its
    // widest circle, which is a lie about what happened.
    const { delivery } = await offeredOrder();
    const courier = await makeCourier();
    await apiPost(
      `/api/deliveries/${delivery.id}/claim`,
      { lat: SHOP.lat, lng: SHOP.lng },
      courier.token
    );
    // Backdate the original posting well past escalation, so a naive
    // implementation reading Task.createdAt would fail this.
    await prisma().task.update({
      where: { id: delivery.taskId },
      data: { createdAt: new Date(Date.now() - 120 * MINUTE) },
    });

    const res = await apiPost(
      `/api/admin/deliveries/${delivery.id}/reopen`,
      { reason: "Did not collect" },
      admin.token
    );
    expect(res.status).toBe(200);

    const after = await prisma().delivery.findUnique({ where: { id: delivery.id } });
    expect(after.status).toBe("STORE_ACCEPTED");
    expect(after.offeredAt).toBeTruthy();
    expect(Date.now() - new Date(after.offeredAt).getTime()).toBeLessThan(2 * MINUTE);

    const board = await apiGet(`/api/admin/deliveries?escalated=1`, admin.token);
    expect(board.body.deliveries.find((d: any) => d.id === delivery.id)).toBeUndefined();
  });
});
