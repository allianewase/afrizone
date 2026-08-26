// Store ownership and account type: the two halves of RBAC, and why one of
// them is not enough on its own.
//
// requireAccountType answers "is this caller a store account?" - which every
// store account answers the same way. It cannot distinguish one store from
// another, so a route relying on it alone is one organizationId away from serving
// another store's orders. requireOrgAccess is the half that actually
// protects a store, and it is the half these tests spend most of their time on.
//
// The 404-not-403 rule below is the least obvious property here and the easiest
// to "fix" into a hole later, so it is asserted explicitly rather than left as
// an implementation detail.
import { describe, it, expect } from "vitest";
import { createUserWithToken, testPrisma } from "./helpers";
import { requireOrgAccess, listOrganizationsForUser } from "../src/util/organization";
import { requireAccountType } from "../src/auth";

const prisma = () => testPrisma() as any;

let seq = 0;

async function makeOrg(status = "ACTIVE", name = "Test Store", kind = "STORE") {
  seq += 1;
  return prisma().organization.create({
    data: { kind, name, slug: `test-org-${seq}-${Date.now()}`, status },
  });
}

async function addMember(organizationId: string, userId: string, role = "STAFF") {
  return prisma().organizationMember.create({ data: { organizationId, userId, role } });
}

describe("store ownership", () => {
  it("lets a member through and hands back the store", async () => {
    const { user } = await createUserWithToken("WORKER");
    const org = await makeOrg();
    await addMember(org.id, user.id, "OWNER");

    const res = await requireOrgAccess(user.id, org.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.org.id).toBe(org.id);
    expect(res.membership.role).toBe("OWNER");
  });

  it("refuses a non-member with 404, never 403", async () => {
    const { user: outsider } = await createUserWithToken("WORKER");
    const { user: insider } = await createUserWithToken("WORKER");
    const org = await makeOrg();
    await addMember(org.id, insider.id);

    const res = await requireOrgAccess(outsider.id, org.id);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // 403 would confirm the store exists and that the caller merely lacks
    // access, turning this into a directory of every store on the platform for
    // anyone willing to enumerate ids. A non-member has no business learning
    // the difference between "not yours" and "not real".
    expect(res.status).toBe(404);
  });

  it("gives the same answer for a store that does not exist", async () => {
    const { user } = await createUserWithToken("WORKER");
    const real = await requireOrgAccess(user.id, "does-not-exist");
    expect(real.ok).toBe(false);
    if (real.ok) return;
    expect(real.status).toBe(404);
    expect(real.error).toBe("Not found");
  });

  it("keeps two stores apart", async () => {
    const { user: aliceUser } = await createUserWithToken("WORKER");
    const { user: bobUser } = await createUserWithToken("WORKER");
    const storeA = await makeOrg("ACTIVE", "Store A");
    const storeB = await makeOrg("ACTIVE", "Store B");
    await addMember(storeA.id, aliceUser.id);
    await addMember(storeB.id, bobUser.id);

    // Each sees their own...
    expect((await requireOrgAccess(aliceUser.id, storeA.id)).ok).toBe(true);
    expect((await requireOrgAccess(bobUser.id, storeB.id)).ok).toBe(true);
    // ...and neither sees the other's. This is the requirement in one line.
    expect((await requireOrgAccess(aliceUser.id, storeB.id)).ok).toBe(false);
    expect((await requireOrgAccess(bobUser.id, storeA.id)).ok).toBe(false);
  });

  it("treats a missing or non-string organizationId as not found rather than throwing", async () => {
    const { user } = await createUserWithToken("WORKER");
    for (const bad of [undefined, null, "", 42, {}, []]) {
      const res = await requireOrgAccess(user.id, bad);
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.status).toBe(404);
    }
  });
});

describe("store role and status gates", () => {
  it("refuses STAFF where OWNER is required, and says so with 403", async () => {
    const { user } = await createUserWithToken("WORKER");
    const org = await makeOrg();
    await addMember(org.id, user.id, "STAFF");

    const res = await requireOrgAccess(user.id, org.id, { roles: ["OWNER"] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // 403 rather than 404 here is correct and is not a contradiction of the
    // rule above: this caller is already known to be a member, so the store's
    // existence is not a secret being leaked to them.
    expect(res.status).toBe(403);
  });

  it("blocks a PENDING store from work, but not from being read", async () => {
    const { user } = await createUserWithToken("WORKER");
    const org = await makeOrg("PENDING");
    await addMember(org.id, user.id, "OWNER");

    // Its own people can still reach it - otherwise completing the profile that
    // gets it approved would be impossible.
    expect((await requireOrgAccess(user.id, org.id)).ok).toBe(true);

    const working = await requireOrgAccess(user.id, org.id, { requireActive: true });
    expect(working.ok).toBe(false);
    if (working.ok) return;
    expect(working.status).toBe(403);
    expect(working.error).toContain("not approved");
  });

  it("blocks a SUSPENDED store and says which of the two it is", async () => {
    const { user } = await createUserWithToken("WORKER");
    const org = await makeOrg("SUSPENDED");
    await addMember(org.id, user.id, "OWNER");

    const res = await requireOrgAccess(user.id, org.id, { requireActive: true });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Suspended and not-yet-approved are different situations for the person
    // reading the message, and collapsing them into one string would leave a
    // suspended store owner waiting for an approval that already happened.
    expect(res.error).toContain("suspended");
  });
});

describe("many stores per person", () => {
  it("lists every store a person can act for, oldest first", async () => {
    const { user } = await createUserWithToken("WORKER");
    const first = await makeOrg("ACTIVE", "Branch One");
    const second = await makeOrg("ACTIVE", "Branch Two");
    await addMember(first.id, user.id, "OWNER");
    await addMember(second.id, user.id, "STAFF");

    const orgs = await listOrganizationsForUser(user.id);
    expect(orgs).toHaveLength(2);
    expect(orgs.map((s) => s.org.id)).toEqual([first.id, second.id]);
    expect(orgs.map((s) => s.role)).toEqual(["OWNER", "STAFF"]);
  });

  it("returns nothing for someone who runs no store", async () => {
    const { user } = await createUserWithToken("WORKER");
    expect(await listOrganizationsForUser(user.id)).toEqual([]);
  });

  it("refuses a second membership for the same person in the same store", async () => {
    const { user } = await createUserWithToken("WORKER");
    const org = await makeOrg();
    await addMember(org.id, user.id, "STAFF");
    // The unique pair is not decoration: requireOrgAccess resolves membership
    // with findUnique on it, which a duplicate row would break outright.
    await expect(addMember(org.id, user.id, "OWNER")).rejects.toThrow();
  });
});

/**
 * requireAccountType is exercised directly rather than through a route, because
 * no route uses it yet. Shipping a guard with no test because its call site has
 * not been written is how a guard ends up not working on the day it is first
 * relied on.
 */
async function runGuard(userId: string | undefined, types: any[]) {
  const captured: { status?: number; body?: any; nexted: boolean } = { nexted: false };
  const req: any = userId ? { user: { id: userId, role: "WORKER", email: "x@y.z" } } : {};
  const res: any = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: any) {
      captured.body = body;
      return res;
    },
  };
  await requireAccountType(...types)(req, res, () => {
    captured.nexted = true;
  });
  return captured;
}

describe("requireAccountType", () => {
  it("lets a matching account through", async () => {
    const { user } = await createUserWithToken("WORKER");
    await prisma().user.update({ where: { id: user.id }, data: { accountType: "STORE" } });
    const r = await runGuard(user.id, ["STORE"]);
    expect(r.nexted).toBe(true);
    expect(r.status).toBeUndefined();
  });

  it("refuses a different account type with 403", async () => {
    const { user } = await createUserWithToken("WORKER");
    const r = await runGuard(user.id, ["STORE"]);
    expect(r.nexted).toBe(false);
    expect(r.status).toBe(403);
  });

  it("accepts any of several listed types", async () => {
    const { user } = await createUserWithToken("WORKER");
    await prisma().user.update({ where: { id: user.id }, data: { accountType: "COURIER" } });
    expect((await runGuard(user.id, ["STORE", "COURIER"])).nexted).toBe(true);
  });

  it("reads the database rather than the token, so a change takes effect at once", async () => {
    const { user } = await createUserWithToken("WORKER");
    expect((await runGuard(user.id, ["COURIER"])).nexted).toBe(false);
    await prisma().user.update({ where: { id: user.id }, data: { accountType: "COURIER" } });
    // No new token was issued. Sessions last seven days, so a guard reading the
    // claim would enforce the old type for a week.
    expect((await runGuard(user.id, ["COURIER"])).nexted).toBe(true);
  });

  it("401s an unauthenticated request", async () => {
    const r = await runGuard(undefined, ["STORE"]);
    expect(r.status).toBe(401);
  });

  it("401s a token whose user no longer exists", async () => {
    // A signature that still verifies is not authentication if the account
    // behind it is gone.
    const r = await runGuard("deleted-user-id", ["INDIVIDUAL"]);
    expect(r.nexted).toBe(false);
    expect(r.status).toBe(401);
  });
});

describe("kind: stores and courier companies share one model", () => {
  it("guards a courier company exactly as it guards a store", async () => {
    const { user } = await createUserWithToken("WORKER");
    const outsider = await createUserWithToken("WORKER");
    const courier = await makeOrg("ACTIVE", "Swift Riders", "COURIER");
    await addMember(courier.id, user.id, "OWNER");

    // Nothing in util/organization.ts branches on kind, and this is the test
    // that says so. The moment it needs to, the shared model is worth
    // re-examining.
    const mine = await requireOrgAccess(user.id, courier.id);
    expect(mine.ok).toBe(true);
    expect((await requireOrgAccess(outsider.user.id, courier.id)).ok).toBe(false);
  });

  it("answers 404 when the kind is wrong, not 403", async () => {
    const { user } = await createUserWithToken("WORKER");
    const courier = await makeOrg("ACTIVE", "Wrong Kind Riders", "COURIER");
    await addMember(courier.id, user.id, "OWNER");

    // A courier id handed to a store-only route is not a permission problem,
    // it is the wrong object - so it answers like anything else this caller
    // cannot address, rather than confirming what kind of business it found.
    const res = await requireOrgAccess(user.id, courier.id, { kind: "STORE" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it("names the right thing when refusing an unapproved courier company", async () => {
    const { user } = await createUserWithToken("WORKER");
    const courier = await makeOrg("PENDING", "Pending Riders", "COURIER");
    await addMember(courier.id, user.id, "OWNER");

    const res = await requireOrgAccess(user.id, courier.id, { requireActive: true });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // "This store is not approved yet" shown to a courier company is the kind
    // of copy that makes people think the system has them confused with
    // somebody else.
    expect(res.error).toContain("courier company");
    expect(res.error).not.toContain("store");
  });

  it("filters the picker by kind", async () => {
    const { user } = await createUserWithToken("WORKER");
    const shop = await makeOrg("ACTIVE", "Corner Shop", "STORE");
    const riders = await makeOrg("ACTIVE", "Corner Riders", "COURIER");
    await addMember(shop.id, user.id, "OWNER");
    await addMember(riders.id, user.id, "STAFF");

    expect(await listOrganizationsForUser(user.id)).toHaveLength(2);
    const stores = await listOrganizationsForUser(user.id, "STORE");
    expect(stores.map((o) => o.org.id)).toEqual([shop.id]);
    const couriers = await listOrganizationsForUser(user.id, "COURIER");
    expect(couriers.map((o) => o.org.id)).toEqual([riders.id]);
  });

  it("defaults to STORE, so rows written before couriers existed are correct", async () => {
    const org = await prisma().organization.create({
      data: { name: "No Kind Given", slug: `nokind-${Date.now()}` },
    });
    expect(org.kind).toBe("STORE");
  });
});

describe("account type", () => {
  it("defaults every account to INDIVIDUAL", async () => {
    const { user } = await createUserWithToken("WORKER");
    const row = await prisma().user.findUnique({ where: { id: user.id } });
    // Migration 0010 defaults the column, so an account created by any code
    // path that predates this field still has a usable type rather than null.
    expect(row.accountType).toBe("INDIVIDUAL");
  });

  it("is a separate axis from role", async () => {
    const { user } = await createUserWithToken("SUPER_ADMIN");
    await prisma().user.update({
      where: { id: user.id },
      data: { accountType: "STORE" },
    });
    const row = await prisma().user.findUnique({ where: { id: user.id } });
    // Changing one must not touch the other. If these two ever end up on one
    // field, this is the test that fails first.
    expect(row.role).toBe("SUPER_ADMIN");
    expect(row.accountType).toBe("STORE");
  });

  it("does not imply store membership on its own", async () => {
    const { user } = await createUserWithToken("WORKER");
    await prisma().user.update({ where: { id: user.id }, data: { accountType: "STORE" } });
    const org = await makeOrg();

    // Being a STORE account is not the same as belonging to THIS store, and
    // this is exactly the gap a route guarded only by account type would leave
    // open.
    const res = await requireOrgAccess(user.id, org.id);
    expect(res.ok).toBe(false);
  });
});
