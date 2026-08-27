// CAC registration checks for stores (Blueprint §15: Store sign-up & KYC).
//
// Two properties are worth protecting here and they pull in opposite directions.
// A registration number is a claim PartTime pays money against, so it must be
// checkable, attributable and unique. And a check that refuses a legitimate
// business is worse than no check at all - a store that cannot sign up produces
// no evidence of why - so the format rules stay loose and no path auto-rejects.
import { describe, it, expect } from "vitest";
import { apiGet, apiPost } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";
import { namesLookAlike, normaliseCac, isPlausibleCac } from "../src/services/cacVerification";

const prisma = () => testPrisma() as any;

let seq = 0;

async function makeStore(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return prisma().organization.create({
    data: {
      kind: "STORE",
      name: `CAC Shop ${seq}`,
      slug: `cac-shop-${seq}-${Date.now()}`,
      status: "PENDING",
      ...overrides,
    },
  });
}

async function ownerOf(orgId: string) {
  const owner = await createUserWithToken("WORKER");
  await prisma().organizationMember.create({
    data: { organizationId: orgId, userId: owner.user.id, role: "OWNER" },
  });
  return owner;
}

async function staffOf(orgId: string) {
  const staff = await createUserWithToken("WORKER");
  await prisma().organizationMember.create({
    data: { organizationId: orgId, userId: staff.user.id, role: "STAFF" },
  });
  return staff;
}

describe("normalising a registration number", () => {
  it("reduces the ways a human writes the same number to one", () => {
    // The reason this exists: without it the same company registers twice and
    // the unique index never notices, because the strings differ.
    expect(normaliseCac("RC 123456")).toBe("RC123456");
    expect(normaliseCac("rc-123456")).toBe("RC123456");
    expect(normaliseCac(" Rc123456 ")).toBe("RC123456");
  });

  it("accepts the shapes the registry actually issues", () => {
    // RC for companies, BN for business names, IT for incorporated trustees,
    // and bare digits, which is how most people write it.
    expect(isPlausibleCac("RC123456")).toBe(true);
    expect(isPlausibleCac("BN1234567")).toBe(true);
    expect(isPlausibleCac("IT98765")).toBe(true);
    expect(isPlausibleCac("1234567")).toBe(true);
  });

  it("refuses only what is plainly not a registration number", () => {
    expect(isPlausibleCac("")).toBe(false);
    expect(isPlausibleCac("RC")).toBe(false);
    // A company name typed into the number field.
    expect(isPlausibleCac("MAMANKECHIPROVISIONS")).toBe(false);
  });
});

describe("comparing a trading name to a registered one", () => {
  it("ignores the legal-form words that differ by definition", () => {
    expect(namesLookAlike("Mama Nkechi Provisions", "MAMA NKECHI PROVISIONS LIMITED")).toBe(true);
    expect(namesLookAlike("Yaba Market Hub", "Yaba Market Hub Nigeria Ltd")).toBe(true);
  });

  it("says so when two names are simply different", () => {
    expect(namesLookAlike("Yaba Market Hub", "Lekki Fabrics Enterprises")).toBe(false);
  });
});

describe("submitting a registration number", () => {
  it("records it as PENDING, never as verified", async () => {
    const org = await makeStore();
    const owner = await ownerOf(org.id);

    const res = await apiPost(`/api/organizations/${org.id}/cac`, { cacNumber: "RC 771234" }, owner.token);
    expect(res.status).toBe(200);

    const after = await prisma().organization.findUnique({ where: { id: org.id } });
    expect(after.cacNumber).toBe("RC771234");
    // The question is not "does this company exist" but "is this the company
    // applying", and only a person answers the second one.
    expect(after.cacStatus).toBe("PENDING");
    expect(after.cacCheckedAt).toBeTruthy();
  });

  it("says the registry was not consulted when none is configured", async () => {
    const org = await makeStore();
    const owner = await ownerOf(org.id);

    await apiPost(`/api/organizations/${org.id}/cac`, { cacNumber: "RC 881234" }, owner.token);

    const after = await prisma().organization.findUnique({ where: { id: org.id } });
    // A reviewer must be able to tell "the registry has no record of this" from
    // "nobody asked the registry" - they mean opposite things.
    expect(after.cacNote).toContain("Registry not consulted");
    expect(after.cacName).toBeNull();
  });

  it("refuses a number already recorded against another business", async () => {
    const first = await makeStore();
    const firstOwner = await ownerOf(first.id);
    await apiPost(`/api/organizations/${first.id}/cac`, { cacNumber: "RC 991234" }, firstOwner.token);

    const second = await makeStore();
    const secondOwner = await ownerOf(second.id);
    // Written differently on purpose: normalisation is what makes this a clash
    // rather than two rows.
    const res = await apiPost(
      `/api/organizations/${second.id}/cac`,
      { cacNumber: "rc-991234" },
      secondOwner.token
    );

    expect(res.status).toBe(409);
    // Checked before the write, so the refusal says what is wrong. A unique
    // constraint violation would surface as a 500 with nothing usable in it.
    expect(res.body.error).toContain("already recorded");
  });

  it("lets a business correct its own number", async () => {
    const org = await makeStore();
    const owner = await ownerOf(org.id);
    await apiPost(`/api/organizations/${org.id}/cac`, { cacNumber: "RC 111222" }, owner.token);
    const res = await apiPost(`/api/organizations/${org.id}/cac`, { cacNumber: "RC 333444" }, owner.token);
    expect(res.status).toBe(200);

    const after = await prisma().organization.findUnique({ where: { id: org.id } });
    expect(after.cacNumber).toBe("RC333444");
  });

  it("refuses something that is not a registration number", async () => {
    const org = await makeStore();
    const owner = await ownerOf(org.id);
    const res = await apiPost(
      `/api/organizations/${org.id}/cac`,
      { cacNumber: "my shop" },
      owner.token
    );
    expect(res.status).toBe(400);

    const after = await prisma().organization.findUnique({ where: { id: org.id } });
    expect(after.cacStatus).toBe("UNVERIFIED");
  });

  it("is OWNER work, not STAFF work", async () => {
    const org = await makeStore();
    const staff = await staffOf(org.id);
    const res = await apiPost(`/api/organizations/${org.id}/cac`, { cacNumber: "RC 445566" }, staff.token);
    // Same class of act as changing the payout account, and staff turnover is
    // exactly the population that should not be able to make it.
    expect(res.status).toBe(403);
  });

  it("does not admit the business exists to somebody unconnected to it", async () => {
    const org = await makeStore();
    const stranger = await createUserWithToken("WORKER");
    const res = await apiPost(
      `/api/organizations/${org.id}/cac`,
      { cacNumber: "RC 556677" },
      stranger.token
    );
    // 404, not 403, and the difference is the point: a non-member is not told
    // the id resolves to anything. STAFF, who are known to belong, get 403 -
    // that is a permission answer to somebody entitled to an answer.
    expect(res.status).toBe(404);
  });
});

describe("deciding on a registration number", () => {
  it("moves it to VERIFIED and writes a trail", async () => {
    const org = await makeStore();
    const owner = await ownerOf(org.id);
    await apiPost(`/api/organizations/${org.id}/cac`, { cacNumber: "RC 667788" }, owner.token);

    const admin = await createUserWithToken("SUPER_ADMIN");
    const res = await apiPost(
      `/api/admin/organizations/${org.id}/cac-decision`,
      { decision: "VERIFIED", note: "Checked against the registry by hand" },
      admin.token
    );
    expect(res.status).toBe(200);
    expect(res.body.cacStatus).toBe("VERIFIED");

    const trail = await prisma().auditLog.findMany({
      where: { entityId: org.id, action: "organization.cac.decided" },
    });
    expect(trail).toHaveLength(1);
  });

  it("will not reject without a reason", async () => {
    const org = await makeStore();
    const owner = await ownerOf(org.id);
    await apiPost(`/api/organizations/${org.id}/cac`, { cacNumber: "RC 778899" }, owner.token);

    const admin = await createUserWithToken("SUPER_ADMIN");
    const res = await apiPost(
      `/api/admin/organizations/${org.id}/cac-decision`,
      { decision: "REJECTED" },
      admin.token
    );
    // "Rejected" with no reason is a store that resubmits the same number, and
    // a queue that grows.
    expect(res.status).toBe(400);

    const after = await prisma().organization.findUnique({ where: { id: org.id } });
    expect(after.cacStatus).toBe("PENDING");
  });

  it("has nothing to decide when no number was supplied", async () => {
    const org = await makeStore();
    const admin = await createUserWithToken("SUPER_ADMIN");
    const res = await apiPost(
      `/api/admin/organizations/${org.id}/cac-decision`,
      { decision: "VERIFIED" },
      admin.token
    );
    expect(res.status).toBe(400);
  });

  it("is not a worker's decision to make", async () => {
    const org = await makeStore();
    const owner = await ownerOf(org.id);
    await apiPost(`/api/organizations/${org.id}/cac`, { cacNumber: "RC 889900" }, owner.token);

    const res = await apiPost(
      `/api/admin/organizations/${org.id}/cac-decision`,
      { decision: "VERIFIED" },
      owner.token
    );
    expect(res.status).toBe(403);
  });
});

describe("what CAC does and does not gate", () => {
  it("does not stop a store being approved", async () => {
    // The point of the default. Stores are live in the pilot without a number,
    // and a column added on Tuesday must not suspend them on Wednesday.
    const org = await makeStore();
    const admin = await createUserWithToken("SUPER_ADMIN");

    const res = await apiPost(`/api/admin/organizations/${org.id}/cac-decision`, {}, admin.token);
    expect(res.status).toBe(400); // nothing to decide, and that is fine

    const patched = await prisma().organization.update({
      where: { id: org.id },
      data: { status: "ACTIVE" },
    });
    expect(patched.status).toBe("ACTIVE");
    expect(patched.cacStatus).toBe("UNVERIFIED");
  });

  it("lists the review queue by status", async () => {
    const org = await makeStore();
    const owner = await ownerOf(org.id);
    await apiPost(`/api/organizations/${org.id}/cac`, { cacNumber: "RC 121212" }, owner.token);

    const admin = await createUserWithToken("SUPER_ADMIN");
    const res = await apiGet("/api/admin/organizations?cacStatus=PENDING", admin.token);
    expect(res.status).toBe(200);
    expect(res.body.every((o: any) => o.cacStatus === "PENDING")).toBe(true);
    expect(res.body.some((o: any) => o.id === org.id)).toBe(true);
  });

  it("tells the review screen whether a registry is wired up", async () => {
    const admin = await createUserWithToken("SUPER_ADMIN");
    const res = await apiGet("/api/admin/organizations/cac/config", admin.token);
    expect(res.status).toBe(200);
    // False under test, and the screen says "manual check" rather than leaving a
    // reviewer to read the absence of a registered name as a red flag.
    expect(res.body.configured).toBe(false);
  });
});
