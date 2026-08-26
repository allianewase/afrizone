// Escrow as state (Blueprint §10).
//
// The promise being tested is the one a worker actually cares about: their pay
// is set aside the moment the contract goes live, and released when the work is
// accepted. Part-Time never holds the money, so what these tests protect is the
// LEDGER being right - a wrong number here is a worker told they are owed
// something they are not, which is worse than no number at all.
//
// Three properties get most of the attention:
//   an hourly commitment carries NO amount until hours are verified,
//   a retried approval must not ring-fence the same work twice,
//   and nothing may claim PAID except off the back of an actual release.
import { describe, it, expect } from "vitest";
import { apiGet, apiPost } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";
import {
  COMMITMENT_TRANSITIONS,
  canTransitionCommitment,
  commitmentLabel,
  committableAmount,
} from "../src/services/commitments";

const prisma = () => testPrisma() as any;

let seq = 0;

async function fixture(payModel: "FIXED" | "HOURLY" = "FIXED") {
  seq += 1;
  const admin = await createUserWithToken("SUPER_ADMIN");
  const worker = await createUserWithToken("WORKER");
  await prisma().user.update({ where: { id: worker.user.id }, data: { tiers: "DISPATCH" } });
  const task = await prisma().task.create({
    data: {
      title: `Commit task ${seq}`,
      description: "x",
      category: "Logistics",
      tier: "DISPATCH",
      payModel,
      budget: payModel === "FIXED" ? 20000 : null,
      rate: payModel === "HOURLY" ? 2500 : null,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 864e5),
      locationType: "PHYSICAL",
      slots: 2,
      status: "OPEN",
      deadline: new Date(Date.now() + 7 * 864e5),
      createdById: admin.user.id,
    },
  });
  const application = await prisma().application.create({
    data: { taskId: task.id, workerId: worker.user.id, status: "APPLIED" },
  });
  return { admin, worker, task, application };
}

describe("the commitment machine", () => {
  it("will not un-ring-fence money that was already declared payable", () => {
    // Taking a release back is a cancellation with a reason, not a quiet
    // reversal to "set aside".
    expect(canTransitionCommitment("RELEASED", "COMMITTED")).toBe(false);
    expect(canTransitionCommitment("RELEASED", "CANCELLED")).toBe(true);
  });

  it("treats PAID as final", () => {
    // Undoing a payment is a refund, which is a new record.
    expect(COMMITMENT_TRANSITIONS.PAID).toEqual([]);
    expect(canTransitionCommitment("PAID", "RELEASED")).toBe(false);
  });

  it("never lets money skip acceptance", () => {
    expect(canTransitionCommitment("COMMITTED", "PAID")).toBe(false);
    expect(canTransitionCommitment("COMMITTED", "RELEASED")).toBe(true);
    expect(canTransitionCommitment("RELEASED", "PAID")).toBe(true);
  });

  it("never shows a worker an enum name", () => {
    for (const s of ["COMMITTED", "RELEASED", "PAID", "CANCELLED"]) {
      expect(commitmentLabel(s)).not.toBe(s);
    }
  });

  it("knows a fixed amount and admits when there is not one", () => {
    expect(committableAmount({ payModel: "FIXED", budget: 20000 })).toBe(20000);
    // Hourly cannot be known before hours exist, so it says so rather than
    // guessing. A wrong number about money is worse than an honest absence.
    expect(committableAmount({ payModel: "HOURLY", rate: 2500 })).toBeNull();
  });
});

describe("approval ring-fences the pay", () => {
  it("commits a fixed task's budget when the contract goes live", async () => {
    const { admin, worker, task, application } = await fixture("FIXED");

    const res = await apiPost(`/api/applications/${application.id}/approve`, {}, admin.token);
    expect(res.status).toBe(200);

    const c = await prisma().commitment.findFirst({ where: { workerId: worker.user.id } });
    expect(c).not.toBeNull();
    expect(c.status).toBe("COMMITTED");
    expect(c.amount).toBe(20000);
    expect(c.reason).toBe("TASK_PAY");

    // It hangs off the contract, which is the thing that binds this worker to
    // this task.
    const contract = await prisma().contract.findFirst({
      where: { taskId: task.id, workerId: worker.user.id },
    });
    expect(c.contractId).toBe(contract.id);
  });

  it("commits an hourly task with no amount at all", async () => {
    const { admin, worker, application } = await fixture("HOURLY");
    await apiPost(`/api/applications/${application.id}/approve`, {}, admin.token);

    const c = await prisma().commitment.findFirst({ where: { workerId: worker.user.id } });
    expect(c.status).toBe("COMMITTED");
    // Not zero. Zero would tell the worker they are owed nothing, which is a
    // different and false statement.
    expect(c.amount).toBeNull();
  });

  it("records who committed it", async () => {
    const { admin, worker, application } = await fixture();
    await apiPost(`/api/applications/${application.id}/approve`, {}, admin.token);
    const c = await prisma().commitment.findFirst({ where: { workerId: worker.user.id } });
    const audit = await prisma().auditLog.findFirst({
      where: { entity: "Commitment", entityId: c.id, action: "commitment.committed" },
    });
    expect(audit).not.toBeNull();
  });

  it("does not ring-fence the same work twice", async () => {
    const { admin, worker, application } = await fixture();
    await apiPost(`/api/applications/${application.id}/approve`, {}, admin.token);
    // A second approve is refused as already-approved, but the guard that
    // matters is the unique (contractId, reason): a retried endpoint must not
    // leave the wallet reporting double.
    await apiPost(`/api/applications/${application.id}/approve`, {}, admin.token);

    const all = await prisma().commitment.findMany({ where: { workerId: worker.user.id } });
    expect(all).toHaveLength(1);
  });
});

describe("acceptance releases it with the real figure", () => {
  it("trues up an hourly commitment from what was actually verified", async () => {
    const { admin, worker, task, application } = await fixture("HOURLY");
    await apiPost(`/api/applications/${application.id}/approve`, {}, admin.token);

    const sheet = await prisma().timesheet.create({
      data: {
        taskId: task.id,
        workerId: worker.user.id,
        periodStart: new Date(),
        periodEnd: new Date(),
        hours: 4,
        status: "SUBMITTED",
      },
    });
    const approved = await apiPost(`/api/timesheets/${sheet.id}/approve`, {}, admin.token);
    expect(approved.status).toBe(200);

    const c = await prisma().commitment.findFirst({ where: { workerId: worker.user.id } });
    expect(c.status).toBe("RELEASED");
    // 4h x 2500 = 10000 gross, less 5% withholding = 9500 net. The commitment
    // carries what the worker actually receives.
    expect(c.amount).toBe(approved.body.payment.net);
    expect(c.releasedAt).not.toBeNull();
  });

  it("keeps both figures, so a dispute can ask what was promised", async () => {
    const { admin, worker, task, application } = await fixture("FIXED");
    await apiPost(`/api/applications/${application.id}/approve`, {}, admin.token);
    const sheet = await prisma().timesheet.create({
      data: {
        taskId: task.id,
        workerId: worker.user.id,
        periodStart: new Date(),
        periodEnd: new Date(),
        hours: 1,
        status: "SUBMITTED",
      },
    });
    await apiPost(`/api/timesheets/${sheet.id}/approve`, {}, admin.token);

    const c = await prisma().commitment.findFirst({ where: { workerId: worker.user.id } });
    const audit = await prisma().auditLog.findFirst({
      where: { entity: "Commitment", entityId: c.id, action: "commitment.released" },
    });
    const meta = JSON.parse(audit.meta);
    // "What were they promised" and "what were they owed" stay separately
    // answerable - which is exactly the question a dispute asks.
    expect(meta.committedAmount).toBe(20000);
    expect(meta.releasedAmount).toBe(c.amount);
  });
});

describe("payment closes it", () => {
  it("marks the commitment paid when the payment is released", async () => {
    const { admin, worker, task, application } = await fixture("FIXED");
    await apiPost(`/api/applications/${application.id}/approve`, {}, admin.token);
    const sheet = await prisma().timesheet.create({
      data: {
        taskId: task.id,
        workerId: worker.user.id,
        periodStart: new Date(),
        periodEnd: new Date(),
        hours: 1,
        status: "SUBMITTED",
      },
    });
    const approved = await apiPost(`/api/timesheets/${sheet.id}/approve`, {}, admin.token);
    const release = await apiPost(
      `/api/payments/${approved.body.payment.id}/release`,
      {},
      admin.token
    );
    expect(release.status).toBe(200);

    const c = await prisma().commitment.findFirst({ where: { workerId: worker.user.id } });
    expect(c.status).toBe("PAID");
    expect(c.paidAt).not.toBeNull();
  });
});

describe("what the worker can see", () => {
  it("shows what is set aside, separately from what is approved", async () => {
    const { admin, worker, task, application } = await fixture("FIXED");
    await apiPost(`/api/applications/${application.id}/approve`, {}, admin.token);

    let res = await apiGet("/api/me/commitments", worker.token);
    expect(res.status).toBe(200);
    expect(res.body.setAside).toBe(20000);
    expect(res.body.approved).toBe(0);
    expect(res.body.items[0].state).toBe("Set aside for you");
    expect(res.body.items[0].task.id).toBe(task.id);

    const sheet = await prisma().timesheet.create({
      data: {
        taskId: task.id,
        workerId: worker.user.id,
        periodStart: new Date(),
        periodEnd: new Date(),
        hours: 1,
        status: "SUBMITTED",
      },
    });
    await apiPost(`/api/timesheets/${sheet.id}/approve`, {}, admin.token);

    res = await apiGet("/api/me/commitments", worker.token);
    // Once accepted it moves out of "set aside" and into "approved" - the two
    // mean different things to somebody waiting to be paid.
    expect(res.body.setAside).toBe(0);
    expect(res.body.approved).toBeGreaterThan(0);
  });

  it("counts an amountless hourly commitment separately from zero", async () => {
    const { admin, worker, application } = await fixture("HOURLY");
    await apiPost(`/api/applications/${application.id}/approve`, {}, admin.token);

    const res = await apiGet("/api/me/commitments", worker.token);
    // "Nothing set aside" and "an amount nobody has worked out yet" are
    // different things to tell a worker, so they are reported separately.
    expect(res.body.setAside).toBe(0);
    expect(res.body.awaitingAmount).toBe(1);
    expect(res.body.items[0].amount).toBeNull();
  });

  it("shows one worker nothing of another's", async () => {
    const { admin, application } = await fixture();
    await apiPost(`/api/applications/${application.id}/approve`, {}, admin.token);
    const outsider = await createUserWithToken("WORKER");

    const res = await apiGet("/api/me/commitments", outsider.token);
    expect(res.body.items).toEqual([]);
    expect(res.body.setAside).toBe(0);
  });

  it("needs a signed-in user", async () => {
    expect((await apiGet("/api/me/commitments")).status).toBe(401);
  });
});
