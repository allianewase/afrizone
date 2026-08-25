// The requirements gate.
//
// The property that matters most here is not any single rule - it is that the
// rules are applied in ONE place. A worker sees a verdict on a task card and
// then taps Apply; if those two answers can disagree, the feature is worse than
// not having it, because it promises work and then refuses it. So the drift
// test below asserts the card and the endpoint agree, case by case, rather than
// asserting each in isolation and hoping.
//
// Everything else follows from that: the blockers a worker is shown must name
// something they can act on, PENDING must never read as MISSING (telling
// someone to upload a document they already uploaded reads as the app losing
// their work), and expiry must be derived from the clock rather than trusted
// from a stored status.
import { describe, it, expect } from "vitest";
import { apiGet, apiPost, apiPatch } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";

const prisma = () => testPrisma() as any;

let seq = 0;

async function makeWorker(tiers: string, kycStatus = "PENDING") {
  const { user, token } = await createUserWithToken("WORKER", { kycStatus });
  await prisma().user.update({ where: { id: user.id }, data: { tiers } });
  return { user: { ...user, tiers }, token };
}

async function makeAdmin() {
  return createUserWithToken("SUPER_ADMIN");
}

async function makeSkill(name: string) {
  seq += 1;
  return prisma().skill.create({
    data: { name, slug: `elig-skill-${seq}`, group: "Logistics", active: true },
  });
}

async function makeCredType(name: string, overrides: Record<string, unknown> = {}) {
  seq += 1;
  return prisma().credentialType.create({
    data: { name, slug: `elig-type-${seq}`, active: true, ...overrides },
  });
}

async function makeTask(
  createdById: string,
  opts: {
    tier?: string;
    requiresIdentityVerified?: boolean;
    skillIds?: string[];
    credentialTypeIds?: string[];
  } = {}
) {
  const task = await prisma().task.create({
    data: {
      title: "Gate test task",
      description: "A task",
      category: "Logistics",
      tier: opts.tier ?? "DISPATCH",
      payModel: "HOURLY",
      rate: 1000,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 864e5),
      locationType: "PHYSICAL",
      slots: 5,
      status: "OPEN",
      deadline: new Date(Date.now() + 7 * 864e5),
      createdById,
      requiresIdentityVerified: opts.requiresIdentityVerified ?? false,
    },
  });
  for (const skillId of opts.skillIds ?? []) {
    await prisma().taskSkillRequirement.create({ data: { taskId: task.id, skillId } });
  }
  for (const credentialTypeId of opts.credentialTypeIds ?? []) {
    await prisma().taskCredentialRequirement.create({ data: { taskId: task.id, credentialTypeId } });
  }
  return task;
}

async function giveCredential(
  workerId: string,
  credentialTypeId: string,
  status: string,
  expiresAt: Date | null = null
) {
  return prisma().credential.create({
    data: { workerId, credentialTypeId, title: "Doc", status, expiresAt },
  });
}

/** The gate defaults ON; a few tests flip it and must put it back. */
async function setEnforcement(value: "on" | "off") {
  await prisma().setting.upsert({
    where: { key: "eligibility.enforce" },
    update: { value },
    create: { key: "eligibility.enforce", value },
  });
}

function codes(blockers: any[]): string[] {
  return blockers.map((b) => b.code).sort();
}

describe("eligibility gate", () => {
  it("lets a matching worker apply to an ungated task", async () => {
    const admin = await makeAdmin();
    const worker = await makeWorker("DISPATCH");
    const task = await makeTask(admin.user.id);

    const res = await apiPost("/api/applications", { taskId: task.id }, worker.token);
    expect(res.status).toBe(201);
  });

  it("blocks on tier, and names the tier in words rather than the enum", async () => {
    const admin = await makeAdmin();
    const worker = await makeWorker("REMOTE");
    const task = await makeTask(admin.user.id, { tier: "DISPATCH" });

    const res = await apiPost("/api/applications", { taskId: task.id }, worker.token);
    expect(res.status).toBe(400);
    expect(codes(res.body.blockers)).toEqual(["TIER"]);
    expect(res.body.error).toContain("Dispatch");
    expect(res.body.error).not.toContain("DISPATCH");
    // Nothing the worker can do about a tier from inside the app, so the UI
    // must not be handed a route that leads nowhere.
    expect(res.body.blockers[0].fix).toBeNull();
  });

  it("blocks an unverified worker on an identity-gated task, and passes a verified one", async () => {
    const admin = await makeAdmin();
    const task = await makeTask(admin.user.id, { requiresIdentityVerified: true });

    const pending = await makeWorker("DISPATCH", "PENDING");
    const blocked = await apiPost("/api/applications", { taskId: task.id }, pending.token);
    expect(blocked.status).toBe(400);
    expect(codes(blocked.body.blockers)).toEqual(["IDENTITY"]);
    expect(blocked.body.blockers[0].fix).toBe("kyc");

    const verified = await makeWorker("DISPATCH", "VERIFIED");
    const ok = await apiPost("/api/applications", { taskId: task.id }, verified.token);
    expect(ok.status).toBe(201);
  });

  it("accepts TIER_APPROVED as identity confirmed", async () => {
    const admin = await makeAdmin();
    const task = await makeTask(admin.user.id, { requiresIdentityVerified: true });
    const worker = await makeWorker("DISPATCH", "TIER_APPROVED");
    const res = await apiPost("/api/applications", { taskId: task.id }, worker.token);
    expect(res.status).toBe(201);
  });

  it("blocks on a missing skill and clears once the worker declares it", async () => {
    const admin = await makeAdmin();
    const skill = await makeSkill("Motorbike riding");
    const task = await makeTask(admin.user.id, { skillIds: [skill.id] });
    const worker = await makeWorker("DISPATCH");

    const blocked = await apiPost("/api/applications", { taskId: task.id }, worker.token);
    expect(blocked.status).toBe(400);
    expect(codes(blocked.body.blockers)).toEqual(["SKILL"]);
    expect(blocked.body.error).toContain("Motorbike riding");
    expect(blocked.body.blockers[0].fix).toBe("skills");

    await prisma().workerSkill.create({ data: { workerId: worker.user.id, skillId: skill.id } });
    const ok = await apiPost("/api/applications", { taskId: task.id }, worker.token);
    expect(ok.status).toBe(201);
  });

  it("distinguishes missing, being-checked, expired and valid credentials", async () => {
    const admin = await makeAdmin();
    const type = await makeCredType("Rider Licence");
    const task = await makeTask(admin.user.id, { credentialTypeIds: [type.id] });

    // Nothing uploaded.
    const none = await makeWorker("DISPATCH");
    const r1 = await apiPost("/api/applications", { taskId: task.id }, none.token);
    expect(codes(r1.body.blockers)).toEqual(["CREDENTIAL_MISSING"]);
    expect(r1.body.error).toContain("Upload your Rider Licence");

    // Uploaded, awaiting review. Must NOT read as missing: telling a worker to
    // upload what they already uploaded reads as the app losing their work.
    const pending = await makeWorker("DISPATCH");
    await giveCredential(pending.user.id, type.id, "PENDING");
    const r2 = await apiPost("/api/applications", { taskId: task.id }, pending.token);
    expect(codes(r2.body.blockers)).toEqual(["CREDENTIAL_PENDING"]);
    expect(r2.body.error).toContain("still checking");

    // VERIFIED but past its expiry date. There is no stored EXPIRED status -
    // this is derived from the clock, which is the whole point.
    const lapsed = await makeWorker("DISPATCH");
    await giveCredential(lapsed.user.id, type.id, "VERIFIED", new Date(Date.now() - 864e5));
    const r3 = await apiPost("/api/applications", { taskId: task.id }, lapsed.token);
    expect(codes(r3.body.blockers)).toEqual(["CREDENTIAL_EXPIRED"]);
    expect(r3.body.error).toContain("expired");

    // Rejected: same fix as missing, but different words.
    const rejected = await makeWorker("DISPATCH");
    await giveCredential(rejected.user.id, type.id, "REJECTED");
    const r4 = await apiPost("/api/applications", { taskId: task.id }, rejected.token);
    expect(codes(r4.body.blockers)).toEqual(["CREDENTIAL_MISSING"]);
    expect(r4.body.error).toContain("clearer copy");

    // Verified and in date.
    const good = await makeWorker("DISPATCH");
    await giveCredential(good.user.id, type.id, "VERIFIED", new Date(Date.now() + 30 * 864e5));
    const r5 = await apiPost("/api/applications", { taskId: task.id }, good.token);
    expect(r5.status).toBe(201);

    // Open-ended (no expiry) is valid too.
    const forever = await makeWorker("DISPATCH");
    await giveCredential(forever.user.id, type.id, "VERIFIED", null);
    const r6 = await apiPost("/api/applications", { taskId: task.id }, forever.token);
    expect(r6.status).toBe(201);
  });

  it("takes the best standing when a worker has several rows of one type", async () => {
    const admin = await makeAdmin();
    const type = await makeCredType("Food Handling");
    const task = await makeTask(admin.user.id, { credentialTypeIds: [type.id] });
    const worker = await makeWorker("DISPATCH");

    // Rejected once, then re-uploaded and approved. The rejected row must not
    // drag the verdict down.
    await giveCredential(worker.user.id, type.id, "REJECTED");
    await giveCredential(worker.user.id, type.id, "VERIFIED", new Date(Date.now() + 30 * 864e5));

    const res = await apiPost("/api/applications", { taskId: task.id }, worker.token);
    expect(res.status).toBe(201);
  });

  it("reports every unmet requirement at once, not just the first", async () => {
    const admin = await makeAdmin();
    const skill = await makeSkill("Forklift");
    const type = await makeCredType("Forklift Ticket");
    const task = await makeTask(admin.user.id, {
      requiresIdentityVerified: true,
      skillIds: [skill.id],
      credentialTypeIds: [type.id],
    });
    const worker = await makeWorker("DISPATCH", "PENDING");

    const res = await apiPost("/api/applications", { taskId: task.id }, worker.token);
    expect(res.status).toBe(400);
    // A worker fixing one thing at a time, discovering the next only after
    // each round trip, gives up. All of it, at once.
    expect(codes(res.body.blockers)).toEqual(["CREDENTIAL_MISSING", "IDENTITY", "SKILL"]);
  });

  it("tells the worker what they already meet, not only what they lack", async () => {
    const admin = await makeAdmin();
    const skill = await makeSkill("Customer service");
    const type = await makeCredType("Safety Card");
    const task = await makeTask(admin.user.id, {
      requiresIdentityVerified: true,
      skillIds: [skill.id],
      credentialTypeIds: [type.id],
    });
    const worker = await makeWorker("DISPATCH", "VERIFIED");
    await prisma().workerSkill.create({ data: { workerId: worker.user.id, skillId: skill.id } });

    const res = await apiGet(`/api/tasks/${task.id}/eligibility`, worker.token);
    expect(res.status).toBe(200);
    expect(res.body.eligibility.eligible).toBe(false);
    expect(res.body.eligibility.met).toContain("ID confirmed");
    expect(res.body.eligibility.met).toContain("Customer service");
    expect(res.body.eligibility.met).toContain("Dispatch");
    expect(res.body.eligibility.checks).toBe(4);
  });
});

describe("the card and the server agree", () => {
  it("gives the same verdict from the task list as from the apply endpoint", async () => {
    const admin = await makeAdmin();
    const skill = await makeSkill("Stock counting");
    const type = await makeCredType("Retail Badge");
    const gated = await makeTask(admin.user.id, {
      requiresIdentityVerified: true,
      skillIds: [skill.id],
      credentialTypeIds: [type.id],
    });
    const open = await makeTask(admin.user.id);

    const worker = await makeWorker("DISPATCH", "VERIFIED");
    await prisma().workerSkill.create({ data: { workerId: worker.user.id, skillId: skill.id } });

    const list = await apiGet("/api/tasks", worker.token);
    expect(list.status).toBe(200);
    const gatedCard = list.body.find((t: any) => t.id === gated.id);
    const openCard = list.body.find((t: any) => t.id === open.id);

    // The card says blocked on the document only...
    expect(gatedCard.eligibility.eligible).toBe(false);
    expect(codes(gatedCard.eligibility.blockers)).toEqual(["CREDENTIAL_MISSING"]);
    // ...and the server refuses for exactly that reason, no other.
    const refused = await apiPost("/api/applications", { taskId: gated.id }, worker.token);
    expect(refused.status).toBe(400);
    expect(codes(refused.body.blockers)).toEqual(codes(gatedCard.eligibility.blockers));

    // And where the card says yes, the server says yes.
    expect(openCard.eligibility.eligible).toBe(true);
    const accepted = await apiPost("/api/applications", { taskId: open.id }, worker.token);
    expect(accepted.status).toBe(201);
  });

  it("carries requirements on the task payload and no verdict for an admin", async () => {
    const admin = await makeAdmin();
    const skill = await makeSkill("Packing");
    const task = await makeTask(admin.user.id, { skillIds: [skill.id] });

    const res = await apiGet(`/api/tasks/${task.id}`, admin.token);
    expect(res.status).toBe(200);
    expect(res.body.requirements.skills.map((s: any) => s.name)).toEqual(["Packing"]);
    // An eligibility verdict computed against an admin account would be
    // meaningless noise on an admin screen.
    expect(res.body.eligibility).toBeNull();
  });
});

describe("the kill-switch", () => {
  it("stops enforcing the new requirements when switched off, but never the tier", async () => {
    const admin = await makeAdmin();
    const skill = await makeSkill("Driving");
    const type = await makeCredType("Licence");
    const gated = await makeTask(admin.user.id, {
      tier: "DISPATCH",
      requiresIdentityVerified: true,
      skillIds: [skill.id],
      credentialTypeIds: [type.id],
    });

    try {
      await setEnforcement("off");

      // Every new-requirement blocker becomes advisory.
      const inTier = await makeWorker("DISPATCH", "PENDING");
      const ok = await apiPost("/api/applications", { taskId: gated.id }, inTier.token);
      expect(ok.status).toBe(201);

      // But the tier check predates this feature. Turning the new gate off must
      // not quietly delete an old rule - that is a regression wearing a flag.
      const wrongTier = await makeWorker("REMOTE", "VERIFIED");
      const refused = await apiPost("/api/applications", { taskId: gated.id }, wrongTier.token);
      expect(refused.status).toBe(400);
      expect(codes(refused.body.blockers)).toEqual(["TIER"]);
    } finally {
      await setEnforcement("on");
    }
  });

  it("still shows the worker what they are missing while switched off", async () => {
    const admin = await makeAdmin();
    const type = await makeCredType("Advisory Doc");
    const task = await makeTask(admin.user.id, { credentialTypeIds: [type.id] });
    const worker = await makeWorker("DISPATCH");

    try {
      await setEnforcement("off");
      // Advisory, not invisible. The switch changes what blocks, not what is
      // true - a worker should still learn the document is wanted.
      const res = await apiGet(`/api/tasks/${task.id}/eligibility`, worker.token);
      expect(res.body.eligibility.eligible).toBe(false);
      expect(codes(res.body.eligibility.blockers)).toEqual(["CREDENTIAL_MISSING"]);
    } finally {
      await setEnforcement("on");
    }
  });

  it("enforces by default when no setting row exists at all", async () => {
    const admin = await makeAdmin();
    const type = await makeCredType("Default Doc");
    const task = await makeTask(admin.user.id, { credentialTypeIds: [type.id] });
    const worker = await makeWorker("DISPATCH");

    await prisma().setting.deleteMany({ where: { key: "eligibility.enforce" } });
    const res = await apiPost("/api/applications", { taskId: task.id }, worker.token);
    expect(res.status).toBe(400);
    await setEnforcement("on");
  });
});

describe("admin task authoring", () => {
  it("creates a task with requirements and denormalises a summary", async () => {
    const admin = await makeAdmin();
    const skill = await makeSkill("Merchandising");
    const type = await makeCredType("ID Card");

    const res = await apiPost(
      "/api/tasks",
      {
        title: "Shelf reset",
        description: "Reset the aisle",
        category: "Retail",
        tier: "PROMO",
        payModel: "HOURLY",
        rate: 1500,
        requiresIdentityVerified: true,
        skillIds: [skill.id],
        credentialTypeIds: [type.id],
      },
      admin.token
    );
    expect(res.status).toBe(201);
    expect(res.body.requirements.requiresIdentityVerified).toBe(true);
    expect(res.body.requirements.skills).toHaveLength(1);
    expect(res.body.requirements.credentialTypes).toHaveLength(1);
    expect(res.body.requirementsSummary).toContain("ID confirmed");
    expect(res.body.requirementsSummary).toContain("ID Card");
  });

  it("refuses requirements that are not in the catalogue", async () => {
    const admin = await makeAdmin();
    const res = await apiPost(
      "/api/tasks",
      {
        title: "Bad",
        description: "Bad",
        category: "Retail",
        tier: "PROMO",
        payModel: "FIXED",
        budget: 5000,
        skillIds: ["does-not-exist"],
      },
      admin.token
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("unknown");
  });

  it("refuses a retired skill, so a task cannot be gated behind something nobody can add", async () => {
    const admin = await makeAdmin();
    const skill = await makeSkill("Obsolete");
    await prisma().skill.update({ where: { id: skill.id }, data: { active: false } });

    const res = await apiPost(
      "/api/tasks",
      {
        title: "Bad",
        description: "Bad",
        category: "Retail",
        tier: "PROMO",
        payModel: "FIXED",
        budget: 5000,
        skillIds: [skill.id],
      },
      admin.token
    );
    expect(res.status).toBe(400);
  });

  it("leaves requirements alone on a PATCH that does not mention them", async () => {
    const admin = await makeAdmin();
    const skill = await makeSkill("Untouched");
    const task = await makeTask(admin.user.id, { skillIds: [skill.id] });

    // A PATCH that only moves a deadline must never quietly strip a task of
    // every requirement it had.
    const res = await apiPatch(
      `/api/tasks/${task.id}`,
      { deadline: new Date(Date.now() + 14 * 864e5).toISOString() },
      admin.token
    );
    expect(res.status).toBe(200);
    expect(res.body.requirements.skills).toHaveLength(1);
  });

  it("replaces requirements and bumps the version when a PATCH does mention them", async () => {
    const admin = await makeAdmin();
    const a = await makeSkill("First");
    const b = await makeSkill("Second");
    const task = await makeTask(admin.user.id, { skillIds: [a.id] });

    const res = await apiPatch(`/api/tasks/${task.id}`, { skillIds: [b.id] }, admin.token);
    expect(res.status).toBe(200);
    expect(res.body.requirements.skills.map((s: any) => s.name)).toEqual(["Second"]);
    expect(res.body.requirements.version).toBe(1);

    // Changing what a task demands after people have applied is the
    // explanation for an applicant who was eligible on Monday and is not on
    // Tuesday, so it leaves a trail.
    const audit = await prisma().auditLog.findFirst({
      where: { entity: "Task", entityId: task.id, action: "task.requirements.updated" },
    });
    expect(audit).not.toBeNull();
  });

  it("counts how many workers a requirement would exclude, before the task exists", async () => {
    const admin = await makeAdmin();
    const skill = await makeSkill("Rare Skill");
    await makeWorker("PROMO");
    await makeWorker("PROMO");
    const withSkill = await makeWorker("PROMO");
    await prisma().workerSkill.create({ data: { workerId: withSkill.user.id, skillId: skill.id } });

    const before = await apiPost(
      "/api/tasks/qualifying-count",
      { tier: "PROMO" },
      admin.token
    );
    expect(before.status).toBe(200);
    expect(before.body.qualifying).toBeGreaterThanOrEqual(3);

    const after = await apiPost(
      "/api/tasks/qualifying-count",
      { tier: "PROMO", skillIds: [skill.id] },
      admin.token
    );
    // Adding the requirement can only shrink the pool, and the admin is told
    // which line did the shrinking - otherwise it surfaces a week later as an
    // empty applicant list with no clue why.
    expect(after.body.qualifying).toBeLessThan(before.body.qualifying);
    expect(after.body.qualifying).toBeGreaterThanOrEqual(1);
    expect(after.body.blockedBy.some((b: any) => b.label === "Rare Skill")).toBe(true);
    // Every exclusion count is scoped to the tier being counted. A line reading
    // "6 excluded" beside a pool of 2 is the panel contradicting itself, and an
    // admin cannot tell which of the two numbers to trust.
    for (const b of after.body.blockedBy) {
      expect(b.count).toBeLessThanOrEqual(after.body.inTier);
    }
    expect(after.body.blockedBy.some((b: any) => b.label === "Not in this tier")).toBe(false);
    // inTier is the honest denominator: tier is who the task is for, not a
    // requirement being weighed in this form.
    expect(after.body.inTier).toBe(before.body.inTier);
  });

  it("keeps qualifying-count away from workers", async () => {
    const worker = await makeWorker("PROMO");
    const res = await apiPost("/api/tasks/qualifying-count", { tier: "PROMO" }, worker.token);
    expect(res.status).toBe(403);
  });
});

describe("approval re-checks and records", () => {
  it("refuses to approve a worker whose credential lapsed after they applied", async () => {
    const admin = await makeAdmin();
    const type = await makeCredType("Perishable Licence");
    const task = await makeTask(admin.user.id, { credentialTypeIds: [type.id] });
    const worker = await makeWorker("DISPATCH");

    const cred = await giveCredential(
      worker.user.id,
      type.id,
      "VERIFIED",
      new Date(Date.now() + 864e5)
    );
    const applied = await apiPost("/api/applications", { taskId: task.id }, worker.token);
    expect(applied.status).toBe(201);

    // Days pass; the licence lapses.
    await prisma().credential.update({
      where: { id: cred.id },
      data: { expiresAt: new Date(Date.now() - 864e5) },
    });

    const refused = await apiPost(
      `/api/applications/${applied.body.id}/approve`,
      {},
      admin.token
    );
    expect(refused.status).toBe(400);
    expect(refused.body.requiresOverride).toBe(true);
    expect(codes(refused.body.blockers)).toEqual(["CREDENTIAL_EXPIRED"]);
  });

  it("lets an admin override explicitly, and records that they did", async () => {
    const admin = await makeAdmin();
    const type = await makeCredType("Override Licence");
    const task = await makeTask(admin.user.id, { credentialTypeIds: [type.id] });
    const worker = await makeWorker("DISPATCH");

    // Applied while the gate was down, so the application exists but the
    // worker does not meet the requirement.
    await setEnforcement("off");
    const applied = await apiPost("/api/applications", { taskId: task.id }, worker.token);
    await setEnforcement("on");
    expect(applied.status).toBe(201);

    const ok = await apiPost(
      `/api/applications/${applied.body.id}/approve`,
      { override: true },
      admin.token
    );
    expect(ok.status).toBe(200);

    // A human can override, and the override is never silent.
    const audit = await prisma().auditLog.findFirst({
      where: { entity: "Application", entityId: applied.body.id, action: "application.approved.override" },
    });
    expect(audit).not.toBeNull();
  });

  it("freezes what was true at approval onto the application", async () => {
    const admin = await makeAdmin();
    const type = await makeCredType("Snapshot Licence");
    const task = await makeTask(admin.user.id, { credentialTypeIds: [type.id] });
    const worker = await makeWorker("DISPATCH");
    const cred = await giveCredential(
      worker.user.id,
      type.id,
      "VERIFIED",
      new Date(Date.now() + 30 * 864e5)
    );

    const applied = await apiPost("/api/applications", { taskId: task.id }, worker.token);
    const approved = await apiPost(`/api/applications/${applied.body.id}/approve`, {}, admin.token);
    expect(approved.status).toBe(200);

    // The licence is later revoked. The record of what was true at approval
    // must not change with it - that is the whole reason it is stored.
    await prisma().credential.update({ where: { id: cred.id }, data: { status: "REVOKED" } });

    const row = await prisma().application.findUnique({ where: { id: applied.body.id } });
    const snap = JSON.parse(row.eligibilitySnapshot);
    expect(snap.eligible).toBe(true);
    expect(snap.credentialStanding[type.id]).toBe("VALID");
    expect(snap.requiredCredentialTypes).toEqual([type.id]);
    expect(snap.at).toBeTruthy();
  });
});
