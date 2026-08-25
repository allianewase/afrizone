// The admin review desk.
//
// This is where everything the eligibility gate will later rely on gets its
// authority, so the tests are about who may decide, what a decision is allowed
// to assert, and what the worker is told afterwards.
import { describe, it, expect } from "vitest";
import { apiGet, apiPost, apiPatch } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";

const prisma = () => testPrisma() as any;

let seq = 0;
async function makeType(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return prisma().credentialType.create({
    data: {
      name: "Driver licence",
      slug: `rtype-${seq}`,
      reviewMode: "ADMIN_REVIEW",
      issuerMode: "THIRD_PARTY",
      requiresExpiry: false,
      requiresReference: false,
      requiresFile: false,
      active: true,
      ...overrides,
    },
  });
}

async function makeCredential(workerId: string, typeId: string, overrides: Record<string, unknown> = {}) {
  return prisma().credential.create({
    data: {
      workerId,
      credentialTypeId: typeId,
      title: "Class C licence",
      status: "PENDING",
      ...overrides,
    },
  });
}

describe("review queue", () => {
  it("works pending oldest-first", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType();
    const older = await makeCredential(w.id, type.id, {
      title: "Older",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await makeCredential(w.id, type.id, {
      title: "Newer",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    const res = await apiGet("/api/credentials?filter=pending", admin);
    expect(res.status).toBe(200);
    // The person who has waited longest is the one the wait is costing.
    expect(res.body[0].id).toBe(older.id);
  });

  it("leaves self-declared types out of the queue entirely", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const cv = await makeType({ name: "CV", reviewMode: "SELF_DECLARED" });
    const c = await makeCredential(w.id, cv.id);

    // Nobody will ever review these, so leaving them in would grow a permanent
    // backlog of work that must never be done.
    const res = await apiGet("/api/credentials?filter=pending", admin);
    expect(res.body.some((r: any) => r.id === c.id)).toBe(false);
  });

  it("finds credentials lapsing soon without any stored expiry status", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType({ requiresExpiry: true });
    const day = 86400000;
    const soon = await makeCredential(w.id, type.id, {
      status: "VERIFIED",
      expiresAt: new Date(Date.now() + 10 * day),
    });
    const later = await makeCredential(w.id, type.id, {
      status: "VERIFIED",
      expiresAt: new Date(Date.now() + 100 * day),
    });
    const gone = await makeCredential(w.id, type.id, {
      status: "VERIFIED",
      expiresAt: new Date(Date.now() - day),
    });

    const res = await apiGet("/api/credentials?filter=expiring", admin);
    const ids = res.body.map((r: any) => r.id);
    expect(ids).toContain(soon.id);
    expect(ids).not.toContain(later.id);
    // Already lapsed is not "expiring" - different problem, different queue.
    expect(ids).not.toContain(gone.id);
  });

  it("rejects an unknown filter rather than quietly returning everything", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    expect((await apiGet("/api/credentials?filter=whatever", admin)).status).toBe(400);
  });

  it("counts pending for the nav badge", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType();
    await makeCredential(w.id, type.id);

    const res = await apiGet("/api/credentials/pending-count", admin);
    expect(res.body.pending).toBeGreaterThanOrEqual(1);
  });

  it("is closed to workers and to task managers", async () => {
    const { token: worker } = await createUserWithToken("WORKER");
    const { token: manager } = await createUserWithToken("TASK_MANAGER");
    expect((await apiGet("/api/credentials?filter=pending", worker)).status).toBe(403);
    expect((await apiGet("/api/credentials?filter=pending", manager)).status).toBe(403);
  });

  it("shows the reviewer a matching reference already verified on someone else", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: first } = await createUserWithToken("WORKER");
    const { user: second } = await createUserWithToken("WORKER");
    const type = await makeType({ requiresReference: true });
    await makeCredential(first.id, type.id, { referenceNumber: "SHARED-1", status: "VERIFIED" });
    const suspect = await makeCredential(second.id, type.id, { referenceNumber: "SHARED-1" });

    const res = await apiGet(`/api/credentials/${suspect.id}`, admin);
    expect(res.status).toBe(200);
    // A warning, never an automatic refusal: a machine is not the right thing
    // to decide that two people cannot share a reference.
    expect(res.body.duplicateOf.workerId).toBe(first.id);
    expect(res.body.status).toBe("PENDING");
  });

  it("shows the worker's other credentials alongside the one under review", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType();
    const target = await makeCredential(w.id, type.id, { title: "Under review" });
    await makeCredential(w.id, type.id, { title: "Another one", status: "REJECTED" });

    const res = await apiGet(`/api/credentials/${target.id}`, admin);
    expect(res.body.otherCredentials).toHaveLength(1);
    expect(res.body.otherCredentials[0].title).toBe("Another one");
  });
});

describe("review decisions", () => {
  it("approves, and lets the reviewer correct the details first", async () => {
    const { token: admin, user: adminUser } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType({ requiresReference: true });
    const c = await makeCredential(w.id, type.id, { referenceNumber: "TYPO-1" });

    // The worker typed theirs on a phone; the reviewer is holding the document.
    const res = await apiPost(
      `/api/credentials/${c.id}/review`,
      { decision: "APPROVE", corrections: { referenceNumber: "AB-12345", issuer: "FRSC" } },
      admin
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("VERIFIED");
    expect(res.body.referenceNumber).toBe("AB-12345");
    expect(res.body.issuer).toBe("FRSC");
    expect(res.body.valid).toBe(true);

    const stored = await prisma().credential.findUnique({ where: { id: c.id } });
    expect(stored.reviewedById).toBe(adminUser.id);
  });

  it("refuses to approve something already past its expiry", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType({ requiresExpiry: true });
    const c = await makeCredential(w.id, type.id, { expiresAt: new Date(Date.now() - 86400000) });

    // It would be VERIFIED and instantly invalid, which is never what the
    // reviewer means by approving it.
    const res = await apiPost(`/api/credentials/${c.id}/review`, { decision: "APPROVE" }, admin);
    expect(res.status).toBe(400);
  });

  it("refuses an expiry correction that precedes the issue date", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType();
    const c = await makeCredential(w.id, type.id, { issuedAt: new Date("2026-01-01") });

    const res = await apiPost(
      `/api/credentials/${c.id}/review`,
      { decision: "APPROVE", corrections: { expiresAt: "2025-01-01" } },
      admin
    );
    expect(res.status).toBe(400);
  });

  it("rejects with a preset reason that reaches the worker verbatim", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w, token: workerToken } = await createUserWithToken("WORKER");
    const type = await makeType();
    const c = await makeCredential(w.id, type.id);

    const res = await apiPost(`/api/credentials/${c.id}/review`, { decision: "REJECT", reasonCode: "blurry" }, admin);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");
    expect(res.body.rejectionReason).toContain("sharper");

    // And it lands in the worker's inbox, which is the whole reason the inbox
    // was built before this phase.
    const inbox = await apiGet("/api/me/notifications", workerToken);
    expect(inbox.body.unreadCount).toBe(1);
    expect(inbox.body.items[0].body).toBe(res.body.rejectionReason);
  });

  it("insists on written detail when the reason is 'other'", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType();
    const c = await makeCredential(w.id, type.id);

    const empty = await apiPost(`/api/credentials/${c.id}/review`, { decision: "REJECT", reasonCode: "other" }, admin);
    expect(empty.status).toBe(400);

    const written = await apiPost(
      `/api/credentials/${c.id}/review`,
      { decision: "REJECT", reasonCode: "other", reasonText: "The back of the card is missing." },
      admin
    );
    expect(written.status).toBe(200);
    expect(written.body.rejectionReason).toBe("The back of the card is missing.");
  });

  it("refuses a reason code it does not recognise", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType();
    const c = await makeCredential(w.id, type.id);
    const res = await apiPost(`/api/credentials/${c.id}/review`, { decision: "REJECT", reasonCode: "meh" }, admin);
    expect(res.status).toBe(400);
  });

  it("revokes a credential that was previously verified", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType();
    const c = await makeCredential(w.id, type.id, { status: "VERIFIED" });

    const res = await apiPost(
      `/api/credentials/${c.id}/review`,
      { decision: "REVOKE", reasonCode: "not_genuine" },
      admin
    );
    expect(res.body.status).toBe("REVOKED");
    expect(res.body.valid).toBe(false);
  });

  it("will not review a self-declared type", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const cv = await makeType({ reviewMode: "SELF_DECLARED" });
    const c = await makeCredential(w.id, cv.id);
    expect((await apiPost(`/api/credentials/${c.id}/review`, { decision: "APPROVE" }, admin)).status).toBe(400);
  });

  it("writes an audit row for every decision", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType();
    const c = await makeCredential(w.id, type.id);
    await apiPost(`/api/credentials/${c.id}/review`, { decision: "APPROVE" }, admin);

    const audit = await prisma().auditLog.findFirst({ where: { entity: "Credential", entityId: c.id } });
    expect(audit.action).toBe("CREDENTIAL_APPROVE");
  });

  it("is closed to workers", async () => {
    const { user: w, token: workerToken } = await createUserWithToken("WORKER");
    const type = await makeType();
    const c = await makeCredential(w.id, type.id);
    const res = await apiPost(`/api/credentials/${c.id}/review`, { decision: "APPROVE" }, workerToken);
    expect(res.status).toBe(403);
    const stored = await prisma().credential.findUnique({ where: { id: c.id } });
    expect(stored.status).toBe("PENDING");
  });
});

describe("admin-granted Afrizone credentials", () => {
  it("grants one, verified on the spot", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType({ issuerMode: "AFRIZONE", requiresFile: false, name: "Trusted rider" });

    // The admin granting it IS the review - there is no document for anyone to
    // check afterwards, so PENDING would be a queue entry nobody can action.
    const res = await apiPost(`/api/workers/${w.id}/credentials`, { credentialTypeId: type.id }, admin);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("VERIFIED");
    expect(res.body.issuer).toBe("Afrizone");
  });

  it("refuses to grant a third-party credential", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType({ issuerMode: "THIRD_PARTY" });

    // Granting it here would assert a fact about a document nobody has seen.
    const res = await apiPost(`/api/workers/${w.id}/credentials`, { credentialTypeId: type.id }, admin);
    expect(res.status).toBe(400);
  });

  it("does not grant the same one twice", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    const type = await makeType({ issuerMode: "AFRIZONE", requiresFile: false });
    await apiPost(`/api/workers/${w.id}/credentials`, { credentialTypeId: type.id }, admin);
    const again = await apiPost(`/api/workers/${w.id}/credentials`, { credentialTypeId: type.id }, admin);
    expect(again.status).toBe(409);
  });
});

describe("admin-editable tiers", () => {
  it("sets a worker's tiers and tells them", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w, token: workerToken } = await createUserWithToken("WORKER");

    const res = await apiPatch(`/api/workers/${w.id}/tiers`, { tiers: ["DISPATCH", "PROMO"] }, admin);
    expect(res.status).toBe(200);
    expect(res.body.tiers.sort()).toEqual(["DISPATCH", "PROMO"]);

    const inbox = await apiGet("/api/me/notifications", workerToken);
    expect(inbox.body.unreadCount).toBe(1);
  });

  it("refuses a tier that is not real", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    // `as Tier` is a compile-time cast that does nothing at runtime, and this
    // column is what task eligibility is gated on.
    const res = await apiPatch(`/api/workers/${w.id}/tiers`, { tiers: ["DISPATCH_RIDER"] }, admin);
    expect(res.status).toBe(400);

    const stored = await prisma().user.findUnique({ where: { id: w.id } });
    expect(stored.tiers).toBe("");
  });

  it("revokes as well as grants", async () => {
    const { token: admin } = await createUserWithToken("SUPER_ADMIN");
    const { user: w } = await createUserWithToken("WORKER");
    await apiPatch(`/api/workers/${w.id}/tiers`, { tiers: ["DISPATCH", "PROMO"] }, admin);
    const res = await apiPatch(`/api/workers/${w.id}/tiers`, { tiers: ["PROMO"] }, admin);
    expect(res.body.tiers).toEqual(["PROMO"]);
  });

  it("is closed to task managers and workers", async () => {
    const { user: w, token: workerToken } = await createUserWithToken("WORKER");
    const { token: manager } = await createUserWithToken("TASK_MANAGER");
    expect((await apiPatch(`/api/workers/${w.id}/tiers`, { tiers: ["PROMO"] }, manager)).status).toBe(403);
    expect((await apiPatch(`/api/workers/${w.id}/tiers`, { tiers: ["PROMO"] }, workerToken)).status).toBe(403);
  });
});

describe("worker profile for admins", () => {
  it("returns skills and credentials together, with skills marked self-declared", async () => {
    const { token: manager } = await createUserWithToken("TASK_MANAGER");
    const { user: w } = await createUserWithToken("WORKER");
    const skill = await prisma().skill.create({
      data: { name: "Riding", slug: `prof-skill-${(seq += 1)}`, group: "Logistics" },
    });
    await prisma().workerSkill.create({ data: { workerId: w.id, skillId: skill.id, years: 3 } });
    const type = await makeType();
    await makeCredential(w.id, type.id, { status: "VERIFIED" });

    const res = await apiGet(`/api/workers/${w.id}/profile`, manager);
    expect(res.status).toBe(200);
    expect(res.body.skills).toHaveLength(1);
    // The screen where somebody is most tempted to read a skill as a checked
    // fact. It is not one.
    expect(res.body.skills[0].selfDeclared).toBe(true);
    expect(res.body.credentials[0].valid).toBe(true);
  });

  it("is closed to workers", async () => {
    const { user: w, token } = await createUserWithToken("WORKER");
    expect((await apiGet(`/api/workers/${w.id}/profile`, token)).status).toBe(403);
  });
});
