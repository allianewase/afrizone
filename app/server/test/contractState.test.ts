// The work lifecycle (Blueprint §4.2).
//
// A state machine is only worth writing down if the ILLEGAL moves are what get
// tested. Anyone can make CLAIMED go to IN_PROGRESS; the reason this file exists
// is that nothing may reach PAID without having been VERIFIED, and nothing may
// come back from PAID except through a dispute.
//
// The transitions are also what payment and analytics hang off, so each one
// writes an audit row. A state change that lands without its audit row is the
// gap that makes a money trail unreconstructable later, which is why they go in
// one transaction and why that is asserted here rather than assumed.
import { describe, it, expect } from "vitest";
import { createUserWithToken, testPrisma } from "./helpers";
import {
  CONTRACT_STATES,
  TRANSITIONS,
  canTransition,
  isTaskExpired,
  isTerminal,
  stateLabel,
  transitionContract,
  type ContractState,
} from "../src/services/contractState";
import { userActor } from "../src/util/audit";

const prisma = () => testPrisma() as any;

let seq = 0;

async function makeContract(status: ContractState = "CLAIMED") {
  seq += 1;
  const { user: admin } = await createUserWithToken("SUPER_ADMIN");
  const { user: worker } = await createUserWithToken("WORKER");
  const task = await prisma().task.create({
    data: {
      title: `State test ${seq}`,
      description: "x",
      category: "Logistics",
      tier: "DISPATCH",
      payModel: "HOURLY",
      rate: 1000,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 864e5),
      locationType: "PHYSICAL",
      slots: 1,
      status: "OPEN",
      deadline: new Date(Date.now() + 7 * 864e5),
      createdById: admin.id,
    },
  });
  const contract = await prisma().contract.create({
    data: { taskId: task.id, workerId: worker.id, status },
  });
  return { contract, task, worker, admin };
}

describe("the transition table", () => {
  it("lists every state as a key, so none can be silently unreachable", () => {
    for (const s of CONTRACT_STATES) {
      expect(TRANSITIONS[s]).toBeDefined()
    }
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...CONTRACT_STATES].sort())
  });

  it("never allows a jump from claimed straight to paid", () => {
    // The whole reason for writing the machine down: money is only owed after
    // acceptance, and acceptance is VERIFIED.
    expect(canTransition("CLAIMED", "PAID")).toBe(false);
    expect(canTransition("IN_PROGRESS", "PAID")).toBe(false);
    expect(canTransition("SUBMITTED", "PAID")).toBe(false);
    expect(canTransition("VERIFIED", "PAID")).toBe(true);
  });

  it("does not let a payment be undone by going backwards", () => {
    // Unwinding a payment is a refund or a clawback - a new record, not a state
    // reversal. The only way out of PAID is forward, or into adjudication.
    expect(TRANSITIONS.PAID).toEqual(["CLOSED", "DISPUTED"]);
    expect(canTransition("PAID", "VERIFIED")).toBe(false);
    expect(canTransition("PAID", "IN_PROGRESS")).toBe(false);
  });

  it("sends rework back to in-progress, not to submitted", () => {
    // §4.2: rework "returns to In Progress". Straight back to SUBMITTED would
    // mark work as handed in that nobody redid.
    expect(canTransition("SUBMITTED", "REWORK")).toBe(true);
    expect(canTransition("REWORK", "IN_PROGRESS")).toBe(true);
    expect(canTransition("REWORK", "SUBMITTED")).toBe(false);
  });

  it("treats CLOSED and CANCELLED as final", () => {
    expect(TRANSITIONS.CLOSED).toEqual([]);
    expect(TRANSITIONS.CANCELLED).toEqual([]);
    expect(isTerminal("CLOSED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("PAID")).toBe(false);
  });

  it("lets a dispute be raised from anywhere work is still live", () => {
    for (const s of ["CLAIMED", "IN_PROGRESS", "SUBMITTED", "REWORK", "VERIFIED", "PAID"] as const) {
      expect(canTransition(s, "DISPUTED")).toBe(true);
    }
    // But not out of a state that is already finished.
    expect(canTransition("CLOSED", "DISPUTED")).toBe(false);
    expect(canTransition("CANCELLED", "DISPUTED")).toBe(false);
  });

  it("rejects states that are not states at all", () => {
    expect(canTransition("CLAIMED", "PENDING_SIGNATURE")).toBe(false);
    expect(canTransition("SIGNED", "IN_PROGRESS")).toBe(false);
    expect(canTransition("", "CLAIMED")).toBe(false);
  });

  it("never shows a worker an enum name", () => {
    for (const s of CONTRACT_STATES) {
      const label = stateLabel(s);
      expect(label).not.toBe(s);
      expect(label).not.toMatch(/_/);
    }
  });
});

describe("moving a contract", () => {
  it("advances it and records who did it", async () => {
    const { contract, worker } = await makeContract("CLAIMED");
    const res = await transitionContract(prisma(), contract.id, "IN_PROGRESS", userActor(worker.id), {
      via: "test",
    });
    expect(res.ok).toBe(true);

    const after = await prisma().contract.findUnique({ where: { id: contract.id } });
    expect(after.status).toBe("IN_PROGRESS");

    // The audit row is not optional. Payment hangs off these transitions, and a
    // state change without a trail is what makes a money question unanswerable
    // months later.
    const audit = await prisma().auditLog.findFirst({
      where: { entity: "Contract", entityId: contract.id, action: "contract.state.changed" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.parse(audit.meta)).toMatchObject({ from: "CLAIMED", to: "IN_PROGRESS", via: "test" });
  });

  it("refuses an illegal move and changes nothing", async () => {
    const { contract, worker } = await makeContract("CLAIMED");
    const res = await transitionContract(prisma(), contract.id, "PAID", userActor(worker.id));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(409);

    const after = await prisma().contract.findUnique({ where: { id: contract.id } });
    expect(after.status).toBe("CLAIMED");
    const audit = await prisma().auditLog.findFirst({
      where: { entity: "Contract", entityId: contract.id },
    });
    // A refused transition must not leave a trail suggesting it happened.
    expect(audit).toBeNull();
  });

  it("treats a repeat of the current state as a success that writes nothing", async () => {
    const { contract, worker } = await makeContract("IN_PROGRESS");
    const res = await transitionContract(prisma(), contract.id, "IN_PROGRESS", userActor(worker.id));
    // A retried request is not an error, and a duplicate audit row would
    // misrepresent one action as two.
    expect(res.ok).toBe(true);
    const audits = await prisma().auditLog.count({
      where: { entity: "Contract", entityId: contract.id },
    });
    expect(audits).toBe(0);
  });

  it("404s a contract that does not exist", async () => {
    const { worker } = await makeContract();
    const res = await transitionContract(prisma(), "nope", "IN_PROGRESS", userActor(worker.id));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(404);
  });

  it("walks the full happy path", async () => {
    const { contract, worker } = await makeContract("CLAIMED");
    const path: ContractState[] = ["IN_PROGRESS", "SUBMITTED", "VERIFIED", "PAID", "CLOSED"];
    for (const to of path) {
      const res = await transitionContract(prisma(), contract.id, to, userActor(worker.id));
      expect(res.ok).toBe(true);
    }
    const after = await prisma().contract.findUnique({ where: { id: contract.id } });
    expect(after.status).toBe("CLOSED");
    // One audit row per real move, so the history reconstructs exactly.
    const audits = await prisma().auditLog.count({
      where: { entity: "Contract", entityId: contract.id, action: "contract.state.changed" },
    });
    expect(audits).toBe(path.length);
  });

  it("will not move a contract that is already finished", async () => {
    const { contract, worker } = await makeContract("CLOSED");
    const res = await transitionContract(prisma(), contract.id, "IN_PROGRESS", userActor(worker.id));
    expect(res.ok).toBe(false);
  });
});

describe("expiry is derived, not stored", () => {
  const past = new Date(Date.now() - 864e5);
  const future = new Date(Date.now() + 864e5);

  it("counts an open, unclaimed, past-deadline posting as expired", () => {
    expect(isTaskExpired({ status: "OPEN", deadline: past }, 0)).toBe(true);
  });

  it("does not expire a posting somebody already took", () => {
    // The deadline is for claiming. Once the work is underway it is irrelevant,
    // and expiring it would strand a worker mid-task.
    expect(isTaskExpired({ status: "OPEN", deadline: past }, 1)).toBe(false);
  });

  it("does not expire a posting that is still in date", () => {
    expect(isTaskExpired({ status: "OPEN", deadline: future }, 0)).toBe(false);
  });

  it("does not expire a posting that is no longer open", () => {
    expect(isTaskExpired({ status: "FILLED", deadline: past }, 0)).toBe(false);
    expect(isTaskExpired({ status: "CLOSED", deadline: past }, 0)).toBe(false);
  });

  it("does not expire a posting with no deadline at all", () => {
    expect(isTaskExpired({ status: "OPEN", deadline: null }, 0)).toBe(false);
  });
});
