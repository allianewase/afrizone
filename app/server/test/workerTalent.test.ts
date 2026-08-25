// The worker's own skills and credentials.
//
// Two properties carry most of the weight here, and both are about a worker
// not being able to assert something the platform would then repeat as fact:
//
//   1. A credential's status is never settable by the worker, and any edit
//      returns it to PENDING. A reviewer approved a specific set of facts; if
//      those facts change, the approval no longer describes them.
//   2. An attached document must belong to the caller, or a worker could put
//      somebody else's licence in front of a reviewer under their own name.
import { describe, it, expect } from "vitest";
import { apiGet, apiPost, apiPatch } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";
import { SELF } from "cloudflare:test";

const prisma = () => testPrisma() as any;

async function apiPut(path: string, json: unknown, token: string) {
  const res = await SELF.fetch(`http://local.test${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(json),
  });
  return { status: res.status, body: await res.json().catch(() => undefined) as any };
}

async function apiDelete(path: string, token: string) {
  const res = await SELF.fetch(`http://local.test${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => undefined) as any };
}

let seq = 0;
async function makeSkill(name: string, group = "Logistics", active = true) {
  seq += 1;
  return prisma().skill.create({
    data: { name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${seq}`, group, active },
  });
}

async function makeType(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return prisma().credentialType.create({
    data: {
      name: "Driver licence",
      slug: `type-${seq}`,
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

async function makeDocument(userId: string) {
  seq += 1;
  return prisma().kycDocument.create({
    data: {
      userId,
      docType: "CREDENTIAL",
      filename: `doc-${seq}.png`,
      originalName: "licence.png",
      mimeType: "image/png",
      path: `r2://kyc/doc-${seq}.png`,
    },
  });
}

describe("worker skills", () => {
  it("replaces the whole set in one call", async () => {
    const { token } = await createUserWithToken("WORKER");
    const a = await makeSkill("Riding");
    const b = await makeSkill("Packing");
    const c = await makeSkill("Sorting");

    const first = await apiPut("/api/me/skills", { skills: [a.id, b.id] }, token);
    expect(first.status).toBe(200);
    expect(first.body.map((s: any) => s.skillId).sort()).toEqual([a.id, b.id].sort());

    // The second call is the whole truth, not an addition.
    const second = await apiPut("/api/me/skills", { skills: [b.id, c.id] }, token);
    expect(second.body.map((s: any) => s.skillId).sort()).toEqual([b.id, c.id].sort());

    const read = await apiGet("/api/me/skills", token);
    expect(read.body.map((s: any) => s.skillId).sort()).toEqual([b.id, c.id].sort());
  });

  it("keeps the original row for a skill carried across an edit", async () => {
    const { user, token } = await createUserWithToken("WORKER");
    const a = await makeSkill("Riding");
    const b = await makeSkill("Packing");
    await apiPut("/api/me/skills", { skills: [a.id] }, token);
    const before = await prisma().workerSkill.findFirst({ where: { workerId: user.id, skillId: a.id } });

    await apiPut("/api/me/skills", { skills: [a.id, b.id] }, token);
    const after = await prisma().workerSkill.findFirst({ where: { workerId: user.id, skillId: a.id } });

    // Diffed rather than wiped and re-inserted, so "declared since" survives.
    expect(after.id).toBe(before.id);
  });

  it("accepts years and updates them in place", async () => {
    const { token } = await createUserWithToken("WORKER");
    const a = await makeSkill("Riding");

    const set = await apiPut("/api/me/skills", { skills: [{ skillId: a.id, years: 4 }] }, token);
    expect(set.body[0].years).toBe(4);

    const updated = await apiPut("/api/me/skills", { skills: [{ skillId: a.id, years: 6 }] }, token);
    expect(updated.body[0].years).toBe(6);
  });

  it("empties the set when given an empty array", async () => {
    const { token } = await createUserWithToken("WORKER");
    const a = await makeSkill("Riding");
    await apiPut("/api/me/skills", { skills: [a.id] }, token);

    const cleared = await apiPut("/api/me/skills", { skills: [] }, token);
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual([]);
  });

  it("refuses an unknown or retired skill, and changes nothing", async () => {
    const { token } = await createUserWithToken("WORKER");
    const good = await makeSkill("Riding");
    const retired = await makeSkill("Fax repair", "Office", false);
    await apiPut("/api/me/skills", { skills: [good.id] }, token);

    expect((await apiPut("/api/me/skills", { skills: [good.id, "nope"] }, token)).status).toBe(400);
    expect((await apiPut("/api/me/skills", { skills: [retired.id] }, token)).status).toBe(400);

    // Rejected wholesale - the previous set is untouched.
    const read = await apiGet("/api/me/skills", token);
    expect(read.body.map((s: any) => s.skillId)).toEqual([good.id]);
  });

  it("still shows a skill that was retired after the worker declared it", async () => {
    const { token } = await createUserWithToken("WORKER");
    const s = await makeSkill("Riding");
    await apiPut("/api/me/skills", { skills: [s.id] }, token);
    await prisma().skill.update({ where: { id: s.id }, data: { active: false } });

    // Retiring must not silently edit somebody's profile.
    const read = await apiGet("/api/me/skills", token);
    expect(read.body).toHaveLength(1);
    expect(read.body[0].retired).toBe(true);
  });

  it("rejects a malformed payload", async () => {
    const { token } = await createUserWithToken("WORKER");
    expect((await apiPut("/api/me/skills", { skills: "riding" }, token)).status).toBe(400);
    expect((await apiPut("/api/me/skills", { skills: [{ years: 3 }] }, token)).status).toBe(400);
    expect((await apiPut("/api/me/skills", {}, token)).status).toBe(400);
  });

  it("keeps one worker's skills out of another's", async () => {
    const { token: mine } = await createUserWithToken("WORKER");
    const { token: theirs } = await createUserWithToken("WORKER");
    const s = await makeSkill("Riding");
    await apiPut("/api/me/skills", { skills: [s.id] }, mine);

    expect((await apiGet("/api/me/skills", theirs)).body).toEqual([]);
  });
});

describe("worker credentials", () => {
  it("submits one and starts it PENDING", async () => {
    const { token } = await createUserWithToken("WORKER");
    const type = await makeType();

    const res = await apiPost(
      "/api/me/credentials",
      { credentialTypeId: type.id, title: "Class C licence", issuer: "FRSC" },
      token
    );
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.state).toBe("PENDING");
    expect(res.body.valid).toBe(false);
  });

  it("cannot be talked into starting VERIFIED", async () => {
    const { token } = await createUserWithToken("WORKER");
    const type = await makeType();
    const res = await apiPost(
      "/api/me/credentials",
      { credentialTypeId: type.id, title: "Mine", status: "VERIFIED", reviewedAt: new Date().toISOString() },
      token
    );
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
  });

  it("enforces what the credential type says it needs", async () => {
    const { token } = await createUserWithToken("WORKER");
    const strict = await makeType({ requiresExpiry: true, requiresReference: true, requiresFile: true });

    const noExpiry = await apiPost(
      "/api/me/credentials",
      { credentialTypeId: strict.id, referenceNumber: "ABC123" },
      token
    );
    expect(noExpiry.status).toBe(400);

    const noRef = await apiPost(
      "/api/me/credentials",
      { credentialTypeId: strict.id, expiresAt: "2030-01-01" },
      token
    );
    expect(noRef.status).toBe(400);

    const noFile = await apiPost(
      "/api/me/credentials",
      { credentialTypeId: strict.id, expiresAt: "2030-01-01", referenceNumber: "ABC123" },
      token
    );
    expect(noFile.status).toBe(400);
  });

  it("refuses a document belonging to someone else", async () => {
    const { user: other } = await createUserWithToken("WORKER");
    const theirDoc = await makeDocument(other.id);
    const { token } = await createUserWithToken("WORKER");
    const type = await makeType({ requiresFile: true });

    // Otherwise a worker could put another person's licence in front of a
    // reviewer under their own name - and read a private document back.
    const res = await apiPost(
      "/api/me/credentials",
      { credentialTypeId: type.id, documentId: theirDoc.id },
      token
    );
    expect(res.status).toBe(400);
  });

  it("accepts the worker's own document", async () => {
    const { user, token } = await createUserWithToken("WORKER");
    const doc = await makeDocument(user.id);
    const type = await makeType({ requiresFile: true });

    const res = await apiPost("/api/me/credentials", { credentialTypeId: type.id, documentId: doc.id }, token);
    expect(res.status).toBe(201);
    expect(res.body.documentId).toBe(doc.id);
  });

  it("refuses an expiry that precedes the issue date", async () => {
    const { token } = await createUserWithToken("WORKER");
    const type = await makeType();
    const res = await apiPost(
      "/api/me/credentials",
      { credentialTypeId: type.id, issuedAt: "2026-01-01", expiresAt: "2025-01-01" },
      token
    );
    expect(res.status).toBe(400);
  });

  it("refuses to let a worker grant themselves an Afrizone-issued credential", async () => {
    const { token } = await createUserWithToken("WORKER");
    const afrizone = await makeType({ issuerMode: "AFRIZONE", requiresFile: false });
    const res = await apiPost("/api/me/credentials", { credentialTypeId: afrizone.id }, token);
    expect(res.status).toBe(403);
  });

  it("sends a verified credential back to PENDING when the worker edits it", async () => {
    const { user, token } = await createUserWithToken("WORKER");
    const type = await makeType();
    const made = await apiPost("/api/me/credentials", { credentialTypeId: type.id, title: "First" }, token);

    const { user: admin } = await createUserWithToken("SUPER_ADMIN");
    await prisma().credential.update({
      where: { id: made.body.id },
      data: { status: "VERIFIED", reviewedById: admin.id, reviewedAt: new Date() },
    });

    // The reviewer approved a specific set of facts. Change them and the
    // approval no longer describes what is on the row.
    const edited = await apiPatch(`/api/me/credentials/${made.body.id}`, { title: "Second" }, token);
    expect(edited.status).toBe(200);
    expect(edited.body.status).toBe("PENDING");
    expect(edited.body.reviewedAt).toBeNull();

    const stored = await prisma().credential.findUnique({ where: { id: made.body.id } });
    expect(stored.reviewedById).toBeNull();
    expect(stored.workerId).toBe(user.id);
  });

  it("clears the rejection reason on resubmission", async () => {
    const { token } = await createUserWithToken("WORKER");
    const type = await makeType();
    const made = await apiPost("/api/me/credentials", { credentialTypeId: type.id, title: "First" }, token);
    await prisma().credential.update({
      where: { id: made.body.id },
      data: { status: "REJECTED", rejectionReason: "Photo is blurry" },
    });

    const edited = await apiPatch(`/api/me/credentials/${made.body.id}`, { title: "Clearer" }, token);
    expect(edited.body.status).toBe("PENDING");
    expect(edited.body.rejectionReason).toBeNull();
  });

  it("refuses to edit or delete another worker's credential", async () => {
    const { token: owner } = await createUserWithToken("WORKER");
    const type = await makeType();
    const made = await apiPost("/api/me/credentials", { credentialTypeId: type.id }, owner);
    const { token: outsider } = await createUserWithToken("WORKER");

    expect((await apiPatch(`/api/me/credentials/${made.body.id}`, { title: "Theirs" }, outsider)).status).toBe(404);
    expect((await apiDelete(`/api/me/credentials/${made.body.id}`, outsider)).status).toBe(404);
    expect(await prisma().credential.count({ where: { id: made.body.id } })).toBe(1);
  });

  it("lets the worker withdraw their own", async () => {
    const { token } = await createUserWithToken("WORKER");
    const type = await makeType();
    const made = await apiPost("/api/me/credentials", { credentialTypeId: type.id }, token);

    expect((await apiDelete(`/api/me/credentials/${made.body.id}`, token)).status).toBe(200);
    expect(await prisma().credential.count({ where: { id: made.body.id } })).toBe(0);
  });

  it("reports a lapsed credential as EXPIRED without anything writing that status", async () => {
    const { token } = await createUserWithToken("WORKER");
    const type = await makeType({ requiresExpiry: true });
    const made = await apiPost(
      "/api/me/credentials",
      { credentialTypeId: type.id, expiresAt: "2030-01-01" },
      token
    );
    await prisma().credential.update({
      where: { id: made.body.id },
      data: { status: "VERIFIED", expiresAt: new Date(Date.now() - 86400000) },
    });

    const list = await apiGet("/api/me/credentials", token);
    const row = list.body.find((c: any) => c.id === made.body.id);
    expect(row.state).toBe("EXPIRED");
    expect(row.valid).toBe(false);
    // The STORED status is still VERIFIED. Nothing ever writes EXPIRED, which
    // is the point: no background job can fail and leave it reading as valid.
    expect(row.status).toBe("VERIFIED");
  });

  it("shows a self-declared type as such rather than as awaiting review", async () => {
    const { token } = await createUserWithToken("WORKER");
    const cv = await makeType({ name: "CV", reviewMode: "SELF_DECLARED" });
    const made = await apiPost("/api/me/credentials", { credentialTypeId: cv.id }, token);

    // Nobody is going to check it, so it must not claim to be "being checked",
    // and it can never satisfy a gate.
    expect(made.body.state).toBe("SELF_DECLARED");
    expect(made.body.valid).toBe(false);
  });

  it("requires a token", async () => {
    expect((await apiGet("/api/me/credentials")).status).toBe(401);
    expect((await apiGet("/api/me/skills")).status).toBe(401);
  });
});
