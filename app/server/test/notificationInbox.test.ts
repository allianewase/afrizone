// The hole this closes: notifyWorker began `if (!user?.pushToken) return`, so
// a worker who declined the notification permission once - or whose token had
// expired - received nothing, forever, and nothing recorded that they hadn't.
// The messages sent through it include an application decision, a credential
// rejection and a released payment.
//
// notifyWorker is exercised directly as well as over HTTP because the property
// that matters is "a record exists even when push cannot happen", and the
// no-token case is precisely the one that produces no observable HTTP effect.
import { describe, it, expect } from "vitest";
import { apiGet, apiPost } from "./http";
import { createUserWithToken, testPrisma } from "./helpers";
import { notifyWorker, notifyWorkers } from "../src/services/push";

// No pushToken is set on any of these users, so nothing here reaches the
// network: the push branch is skipped entirely and only the record is written.
const prisma = () => testPrisma() as any;

describe("notifyWorker records regardless of push", () => {
  it("writes an inbox row for a worker with no push token", async () => {
    const { user } = await createUserWithToken("WORKER");

    await notifyWorker(prisma(), user.id, "Application approved", "You got the job", {
      screen: "tasks",
    });

    const rows = await prisma().notification.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Application approved");
    expect(rows[0].readAt).toBeNull();
    expect(JSON.parse(rows[0].data)).toEqual({ screen: "tasks" });
  });

  it("still records when the worker has that push preference switched off", async () => {
    const { user } = await createUserWithToken("WORKER");
    await prisma().user.update({ where: { id: user.id }, data: { notifTasks: false } });

    await notifyWorker(prisma(), user.id, "Application rejected", "Not this time", undefined, "notifTasks");

    // The preference means "do not interrupt me", not "keep me in the dark".
    expect(await prisma().notification.count({ where: { userId: user.id } })).toBe(1);
  });

  it("records for every worker in a batch, not just the reachable ones", async () => {
    const a = (await createUserWithToken("WORKER")).user;
    const b = (await createUserWithToken("WORKER")).user;
    // The old query filtered on `pushToken: { not: null }`, so a worker
    // without one was never even considered.
    await notifyWorkers(prisma(), [a.id, b.id], "Payments released", "Check your wallet", {
      screen: "wallet",
    });

    expect(await prisma().notification.count({ where: { userId: a.id } })).toBe(1);
    expect(await prisma().notification.count({ where: { userId: b.id } })).toBe(1);
  });

  it("does nothing for a user id that does not exist", async () => {
    await expect(notifyWorker(prisma(), "no-such-user", "t", "b")).resolves.toBeUndefined();
  });
});

describe("inbox endpoints", () => {
  it("lists newest-first with an unread count", async () => {
    const { user, token } = await createUserWithToken("WORKER");
    await notifyWorker(prisma(), user.id, "First", "one");
    await notifyWorker(prisma(), user.id, "Second", "two");

    const res = await apiGet("/api/me/notifications", token);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].title).toBe("Second");
    expect(res.body.unreadCount).toBe(2);
    expect(res.body.items[0].read).toBe(false);
  });

  it("shows only the caller's own notifications", async () => {
    const { user: mine, token } = await createUserWithToken("WORKER");
    const { user: theirs } = await createUserWithToken("WORKER");
    await notifyWorker(prisma(), mine.id, "Mine", "b");
    await notifyWorker(prisma(), theirs.id, "Theirs", "b");

    const res = await apiGet("/api/me/notifications", token);
    expect(res.body.items.map((n: any) => n.title)).toEqual(["Mine"]);
  });

  it("marks one read and drops the badge", async () => {
    const { user, token } = await createUserWithToken("WORKER");
    await notifyWorker(prisma(), user.id, "First", "one");
    await notifyWorker(prisma(), user.id, "Second", "two");
    const list = await apiGet("/api/me/notifications", token);
    const target = list.body.items[0].id;

    const res = await apiPost(`/api/me/notifications/${target}/read`, {}, token);
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(1);

    // Idempotent: marking it again is not an error and does not double-count.
    const again = await apiPost(`/api/me/notifications/${target}/read`, {}, token);
    expect(again.status).toBe(200);
    expect(again.body.unreadCount).toBe(1);
  });

  it("refuses to mark another worker's notification read", async () => {
    const { user: theirs } = await createUserWithToken("WORKER");
    await notifyWorker(prisma(), theirs.id, "Theirs", "b");
    const row = await prisma().notification.findFirst({ where: { userId: theirs.id } });
    const { token: outsider } = await createUserWithToken("WORKER");

    const res = await apiPost(`/api/me/notifications/${row.id}/read`, {}, outsider);
    expect(res.status).toBe(404);

    const still = await prisma().notification.findUnique({ where: { id: row.id } });
    expect(still.readAt).toBeNull();
  });

  it("clears the whole badge with read-all", async () => {
    const { user, token } = await createUserWithToken("WORKER");
    for (const t of ["a", "b", "c"]) await notifyWorker(prisma(), user.id, t, t);

    const res = await apiPost("/api/me/notifications/read-all", {}, token);
    expect(res.status).toBe(200);
    expect(res.body.marked).toBe(3);
    expect(res.body.unreadCount).toBe(0);

    const count = await apiGet("/api/me/notifications/unread-count", token);
    expect(count.body.unreadCount).toBe(0);
  });

  it("requires a token", async () => {
    expect((await apiGet("/api/me/notifications")).status).toBe(401);
    expect((await apiGet("/api/me/notifications/unread-count")).status).toBe(401);
  });
});

describe("real routes write to the inbox", () => {
  it("approving an application leaves the worker a record of it", async () => {
    const { token: adminToken } = await createUserWithToken("SUPER_ADMIN");
    const { user: worker, token: workerToken } = await createUserWithToken("WORKER");

    const task = await apiPost(
      "/api/tasks",
      {
        title: "Campus promo run",
        description: "Hand out flyers",
        category: "Promo",
        tier: "STUDENT",
        payModel: "FIXED",
        budget: 10000,
        slots: 1,
      },
      adminToken
    );
    expect(task.status).toBe(201);

    const application = await prisma().application.create({
      data: { taskId: task.body.id, workerId: worker.id, status: "APPLIED" },
    });
    const approve = await apiPost(`/api/applications/${application.id}/approve`, {}, adminToken);
    expect(approve.status).toBe(200);

    // The worker has no push token, so before this change the approval
    // reached them through no channel at all.
    const inbox = await apiGet("/api/me/notifications", workerToken);
    expect(inbox.body.unreadCount).toBe(1);
    expect(inbox.body.items[0].title).toContain("approved");
    expect(inbox.body.items[0].data).toEqual({ screen: "tasks" });
  });
});
