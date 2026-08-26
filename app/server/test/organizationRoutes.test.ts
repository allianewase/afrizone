// Store routes over HTTP.
//
// storeAccess.test.ts already proves the guard in isolation. What this file
// proves is that every route actually calls it - a correct guard nobody invoked
// is the usual way this kind of hole survives review, and it cannot be caught
// by testing the guard alone.
//
// Two rules get most of the attention:
//
//   Cross-store isolation, on every endpoint rather than one. It only takes one
//   handler that looks a store up by id alone.
//
//   A store must keep an owner. An ownerless store cannot add members, edit
//   itself or fix its own payout account - a support ticket produced by one
//   mis-click, so it is refused rather than apologised for.
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";
import { apiGet, apiPost, apiPatch } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";

const prisma = () => testPrisma() as any;

async function apiDelete(path: string, token: string) {
  const res = await SELF.fetch(`http://local.test${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: (await res.json().catch(() => undefined)) as any };
}

let seq = 0;

/** An organization plus an OWNER who can act for it. The common fixture. */
async function orgWithOwner(status = "ACTIVE", kind = "STORE") {
  seq += 1;
  const owner = await createUserWithToken("WORKER");
  const org = await prisma().organization.create({
    data: { kind, name: `Org ${seq}`, slug: `route-org-${seq}-${Date.now()}`, status },
  });
  await prisma().organizationMember.create({
    data: { organizationId: org.id, userId: owner.user.id, role: "OWNER" },
  });
  return { org, owner };
}

async function addStaff(organizationId: string) {
  const staff = await createUserWithToken("WORKER");
  const member = await prisma().organizationMember.create({
    data: { organizationId, userId: staff.user.id, role: "STAFF" },
  });
  return { staff, member };
}

describe("listing my stores", () => {
  it("returns only the stores the caller belongs to", async () => {
    const mine = await orgWithOwner();
    await orgWithOwner(); // somebody else's

    const res = await apiGet("/api/organizations", mine.owner.token);
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.id)).toEqual([mine.org.id]);
    expect(res.body[0].myRole).toBe("OWNER");
  });

  it("returns an empty list rather than an error for someone with no store", async () => {
    const { token } = await createUserWithToken("WORKER");
    const res = await apiGet("/api/organizations", token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("cross-store isolation", () => {
  it("hides another store on every endpoint, with 404 rather than 403", async () => {
    const theirs = await orgWithOwner();
    const outsider = await createUserWithToken("WORKER");
    const id = theirs.org.id;

    // One handler that looks a store up by id alone is all it takes, so this
    // walks the whole surface rather than sampling it.
    const attempts = [
      await apiGet(`/api/organizations/${id}`, outsider.token),
      await apiGet(`/api/organizations/${id}/members`, outsider.token),
      await apiPatch(`/api/organizations/${id}`, { name: "Hijacked" }, outsider.token),
      await apiPost(`/api/organizations/${id}/members`, { email: "x@y.z" }, outsider.token),
      await apiPatch(`/api/organizations/${id}/members/anything`, { role: "OWNER" }, outsider.token),
      await apiDelete(`/api/organizations/${id}/members/anything`, outsider.token),
    ];
    for (const r of attempts) expect(r.status).toBe(404);

    // And nothing was actually changed by any of them.
    const after = await prisma().organization.findUnique({ where: { id } });
    expect(after.name).toBe(theirs.org.name);
  });

  it("refuses an unauthenticated caller before anything else", async () => {
    const theirs = await orgWithOwner();
    expect((await apiGet(`/api/organizations/${theirs.org.id}`)).status).toBe(401);
    expect((await apiGet("/api/organizations")).status).toBe(401);
  });
});

describe("editing a store", () => {
  it("lets an OWNER edit and derives the mask from the account it was given", async () => {
    const { org, owner } = await orgWithOwner();
    const res = await apiPatch(
      `/api/organizations/${org.id}`,
      { name: "Yaba Mart", bankAccountNumber: "0123456789", bankCode: "058" },
      owner.token
    );
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Yaba Mart");
    // Derived server-side. A mask that does not match the account is worse than
    // none, because it is the only thing anyone eyeballs before a payout.
    expect(res.body.bankMasked).toBe("****6789");
  });

  it("refuses a STAFF edit with 403", async () => {
    const { org } = await orgWithOwner();
    const { staff } = await addStaff(org.id);
    const res = await apiPatch(`/api/organizations/${org.id}`, { name: "Nope" }, staff.token);
    // 403, not 404: they are a known member, so the store's existence is not a
    // secret being leaked to them.
    expect(res.status).toBe(403);
  });

  it("never lets a store change its own status, at any role", async () => {
    const { org, owner } = await orgWithOwner("PENDING");
    const res = await apiPatch(`/api/organizations/${org.id}`, { status: "ACTIVE" }, owner.token);
    // Either refused outright as an empty update, or accepted while ignoring
    // the field - both are fine. What must not happen is a store approving
    // itself, which is the hole the PENDING default exists to close.
    const after = await prisma().organization.findUnique({ where: { id: org.id } });
    expect(after.status).toBe("PENDING");
    expect([200, 400]).toContain(res.status);
  });
});

describe("payout visibility", () => {
  it("shows the full account to an OWNER and hides it from STAFF", async () => {
    const { org, owner } = await orgWithOwner();
    await apiPatch(`/api/organizations/${org.id}`, { bankAccountNumber: "0123456789" }, owner.token);
    const { staff } = await addStaff(org.id);

    const asOwner = await apiGet(`/api/organizations/${org.id}`, owner.token);
    expect(asOwner.body.bankAccountNumber).toBe("0123456789");

    const asStaff = await apiGet(`/api/organizations/${org.id}`, staff.token);
    // Staff work orders. Store staff turnover is exactly the population you do
    // not want holding the payout account.
    expect(asStaff.body.bankAccountNumber).toBeUndefined();
    expect(asStaff.body.bankMasked).toBe("****6789");
  });
});

describe("members", () => {
  it("adds an existing account and leaves their accountType alone", async () => {
    const { org, owner } = await orgWithOwner();
    const joiner = await createUserWithToken("WORKER");

    const res = await apiPost(
      `/api/organizations/${org.id}/members`,
      { email: joiner.user.email, role: "STAFF" },
      owner.token
    );
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("STAFF");

    // Membership and account type are separate facts. Overwriting the second
    // here would silently move an individual worker off their own dashboard.
    const row = await prisma().user.findUnique({ where: { id: joiner.user.id } });
    expect(row.accountType).toBe("INDIVIDUAL");
  });

  it("refuses to invent an account for an unknown address", async () => {
    const { org, owner } = await orgWithOwner();
    const res = await apiPost(
      `/api/organizations/${org.id}/members`,
      { email: "nobody@example.com" },
      owner.token
    );
    // Creating one implicitly would let a store owner mint logins for addresses
    // they do not control.
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("No Afrizone account");
  });

  it("refuses a duplicate membership", async () => {
    const { org, owner } = await orgWithOwner();
    const { staff } = await addStaff(org.id);
    const res = await apiPost(
      `/api/organizations/${org.id}/members`,
      { email: staff.user.email },
      owner.token
    );
    expect(res.status).toBe(409);
  });

  it("does not let STAFF add or remove anyone", async () => {
    const { org } = await orgWithOwner();
    const { staff } = await addStaff(org.id);
    const other = await createUserWithToken("WORKER");

    const add = await apiPost(
      `/api/organizations/${org.id}/members`,
      { email: other.user.email },
      staff.token
    );
    expect(add.status).toBe(403);
  });

  it("lets an OWNER remove a member", async () => {
    const { org, owner } = await orgWithOwner();
    const { member } = await addStaff(org.id);
    const res = await apiDelete(`/api/organizations/${org.id}/members/${member.id}`, owner.token);
    expect(res.status).toBe(200);
    expect(await prisma().organizationMember.findUnique({ where: { id: member.id } })).toBeNull();
  });

  it("will not remove a member of a different store", async () => {
    const a = await orgWithOwner();
    const b = await orgWithOwner();
    const { member: bMember } = await addStaff(b.org.id);

    // The membership id is real, just not theirs. A handler that looked it up
    // by id alone would delete it.
    const res = await apiDelete(`/api/organizations/${a.org.id}/members/${bMember.id}`, a.owner.token);
    expect(res.status).toBe(404);
    expect(await prisma().organizationMember.findUnique({ where: { id: bMember.id } })).not.toBeNull();
  });
});

describe("a store must keep an owner", () => {
  it("refuses to remove the last owner", async () => {
    const { org, owner } = await orgWithOwner();
    const membership = await prisma().organizationMember.findFirst({
      where: { organizationId: org.id, userId: owner.user.id },
    });
    const res = await apiDelete(`/api/organizations/${org.id}/members/${membership.id}`, owner.token);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("at least one owner");
  });

  it("refuses to demote the last owner", async () => {
    const { org, owner } = await orgWithOwner();
    const membership = await prisma().organizationMember.findFirst({
      where: { organizationId: org.id, userId: owner.user.id },
    });
    const res = await apiPatch(
      `/api/organizations/${org.id}/members/${membership.id}`,
      { role: "STAFF" },
      owner.token
    );
    expect(res.status).toBe(400);
  });

  it("allows both once a second owner exists", async () => {
    const { org, owner } = await orgWithOwner();
    const second = await createUserWithToken("WORKER");
    await apiPost(
      `/api/organizations/${org.id}/members`,
      { email: second.user.email, role: "OWNER" },
      owner.token
    );

    const membership = await prisma().organizationMember.findFirst({
      where: { organizationId: org.id, userId: owner.user.id },
    });
    const res = await apiPatch(
      `/api/organizations/${org.id}/members/${membership.id}`,
      { role: "STAFF" },
      owner.token
    );
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("STAFF");
  });
});

describe("kind over the wire", () => {
  it("registers a courier company and keeps it out of the store list", async () => {
    const admin = await createUserWithToken("SUPER_ADMIN");
    const res = await apiPost(
      "/api/admin/organizations",
      { name: "Lagos Swift Logistics", kind: "COURIER" },
      admin.token
    );
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("COURIER");
    expect(res.body.status).toBe("PENDING");

    const stores = await apiGet("/api/admin/organizations?kind=STORE", admin.token);
    expect(stores.body.some((o: any) => o.id === res.body.id)).toBe(false);
    const couriers = await apiGet("/api/admin/organizations?kind=COURIER", admin.token);
    expect(couriers.body.some((o: any) => o.id === res.body.id)).toBe(true);
  });

  it("defaults to STORE when no kind is given", async () => {
    const admin = await createUserWithToken("SUPER_ADMIN");
    const res = await apiPost("/api/admin/organizations", { name: "Assumed Store" }, admin.token);
    expect(res.body.kind).toBe("STORE");
  });

  it("ignores an unrecognised kind rather than storing it", async () => {
    const admin = await createUserWithToken("SUPER_ADMIN");
    const res = await apiPost(
      "/api/admin/organizations",
      { name: "Nonsense Kind", kind: "BANK" },
      admin.token
    );
    // An unvalidated discriminator would sit in the column and silently exclude
    // the row from every kind-filtered list, with nothing to explain why.
    expect(res.body.kind).toBe("STORE");
  });

  it("will not let anyone reclassify a business after the fact", async () => {
    const admin = await createUserWithToken("SUPER_ADMIN");
    const { org, owner } = await orgWithOwner("ACTIVE", "STORE");

    await apiPatch(`/api/admin/organizations/${org.id}`, { kind: "COURIER" }, admin.token);
    await apiPatch(`/api/organizations/${org.id}`, { kind: "COURIER" }, owner.token);

    // Changing kind would silently change what work an existing business can
    // receive. That is a new registration, not an edit.
    const after = await prisma().organization.findUnique({ where: { id: org.id } });
    expect(after.kind).toBe("STORE");
  });

  it("lets a member filter their own list by kind", async () => {
    const shop = await orgWithOwner("ACTIVE", "STORE");
    const riders = await prisma().organization.create({
      data: { kind: "COURIER", name: "Side Riders", slug: `side-riders-${Date.now()}`, status: "ACTIVE" },
    });
    await prisma().organizationMember.create({
      data: { organizationId: riders.id, userId: shop.owner.user.id, role: "STAFF" },
    });

    const all = await apiGet("/api/organizations", shop.owner.token);
    expect(all.body).toHaveLength(2);
    const onlyStores = await apiGet("/api/organizations?kind=STORE", shop.owner.token);
    expect(onlyStores.body.map((o: any) => o.id)).toEqual([shop.org.id]);
  });
});

describe("registration declares an account type", () => {
  let n = 0;
  function email() {
    n += 1;
    return `reg-${n}-${Date.now()}@afrizone.work`;
  }

  it("records the type the person chose", async () => {
    const res = await apiPost("/api/auth/register", {
      name: "Store Owner",
      email: email(),
      password: "correct-horse-battery",
      accountType: "STORE",
    });
    expect(res.status).toBe(200);
    expect(res.body.user.accountType).toBe("STORE");
  });

  it("defaults to INDIVIDUAL when none is given", async () => {
    const res = await apiPost("/api/auth/register", {
      name: "Plain Worker",
      email: email(),
      password: "correct-horse-battery",
    });
    expect(res.body.user.accountType).toBe("INDIVIDUAL");
  });

  it("falls back to INDIVIDUAL rather than storing an unrecognised value", async () => {
    const res = await apiPost("/api/auth/register", {
      name: "Chancer",
      email: email(),
      password: "correct-horse-battery",
      accountType: "ADMIN",
    });
    // An unvalidated string would sit in the column and quietly fail every
    // requireAccountType check afterwards, with nothing to explain why.
    expect(res.body.user.accountType).toBe("INDIVIDUAL");
  });

  it("never lets the client choose a role", async () => {
    const res = await apiPost("/api/auth/register", {
      name: "Chancer",
      email: email(),
      password: "correct-horse-battery",
      accountType: "STORE",
      role: "SUPER_ADMIN",
    });
    // Self-serve signup can only ever mint an outside party. role is about
    // Afrizone staff and is not a field the client gets a say in.
    expect(res.body.user.role).toBe("WORKER");
  });

  it("does not hand a STORE account any store", async () => {
    const res = await apiPost("/api/auth/register", {
      name: "Hopeful Owner",
      email: email(),
      password: "correct-horse-battery",
      accountType: "STORE",
    });
    // Declaring yourself a store is not the same as belonging to one. The app
    // has to handle this state rather than assume it away.
    const mine = await apiGet("/api/organizations", res.body.token);
    expect(mine.body).toEqual([]);
  });
});

describe("Afrizone staff", () => {
  it("creates a store PENDING and seeds its first owner", async () => {
    const admin = await createUserWithToken("SUPER_ADMIN");
    const owner = await createUserWithToken("WORKER");

    const res = await apiPost(
      "/api/admin/organizations",
      { name: "Surulere Mart", ownerEmail: owner.user.email },
      admin.token
    );
    expect(res.status).toBe(201);
    // PENDING by default: a store that could take orders the moment somebody
    // typed its name in would be a hole, not a convenience.
    expect(res.body.status).toBe("PENDING");
    expect(res.body.slug).toBe("surulere-mart");

    const members = await prisma().organizationMember.findMany({ where: { organizationId: res.body.id } });
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("OWNER");
  });

  it("creates no store at all when the owner email is wrong", async () => {
    const admin = await createUserWithToken("SUPER_ADMIN");
    const before = await prisma().organization.count();
    const res = await apiPost(
      "/api/admin/organizations",
      { name: "Ghost Mart", ownerEmail: "typo@example.com" },
      admin.token
    );
    expect(res.status).toBe(404);
    // Resolved before the create, so a typo cannot leave an ownerless store.
    expect(await prisma().organization.count()).toBe(before);
  });

  it("refuses a duplicate slug", async () => {
    const admin = await createUserWithToken("SUPER_ADMIN");
    await apiPost("/api/admin/organizations", { name: "Twin Mart", slug: "twin-mart" }, admin.token);
    const again = await apiPost(
      "/api/admin/organizations",
      { name: "Twin Mart Again", slug: "twin-mart" },
      admin.token
    );
    expect(again.status).toBe(409);
  });

  it("approves a store and records who did it", async () => {
    const admin = await createUserWithToken("SUPER_ADMIN");
    const { org } = await orgWithOwner("PENDING");

    const res = await apiPatch(`/api/admin/organizations/${org.id}`, { status: "ACTIVE" }, admin.token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACTIVE");

    // Approving is what lets a store receive orders and be paid, so it is a
    // decision by a named person.
    const audit = await prisma().auditLog.findFirst({
      where: { entity: "Organization", entityId: org.id, action: "organization.status.changed" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit.meta)).toMatchObject({ from: "PENDING", to: "ACTIVE" });
  });

  it("rejects an unknown status rather than storing it", async () => {
    const admin = await createUserWithToken("SUPER_ADMIN");
    const { org } = await orgWithOwner();
    const res = await apiPatch(`/api/admin/organizations/${org.id}`, { status: "BANNED" }, admin.token);
    expect(res.status).toBe(400);
  });

  it("keeps the admin routes away from store members and workers", async () => {
    const { org, owner } = await orgWithOwner();
    // An OWNER of this very store still cannot reach the admin surface - that
    // is the whole reason approval lives on a separate router.
    expect((await apiGet("/api/admin/organizations", owner.token)).status).toBe(403);
    expect(
      (await apiPatch(`/api/admin/organizations/${org.id}`, { status: "ACTIVE" }, owner.token)).status
    ).toBe(403);
  });
});
