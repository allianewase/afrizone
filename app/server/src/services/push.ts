/**
 * Worker notification delivery.
 *
 * TWO CHANNELS, DELIBERATELY UNEQUAL:
 *
 *  - The in-app inbox (the Notification table) is the RECORD. It is written
 *    first, and awaited, so by the time a route responds the worker can find
 *    out what happened by opening the app.
 *  - Expo push is BEST EFFORT on top of that. It goes over the network to a
 *    third party, it depends on a permission the worker may have declined, and
 *    it is never allowed to fail a request.
 *
 * It used to be push alone. `if (!user?.pushToken) return` meant a worker who
 * tapped "don't allow" once, or whose token had expired, received nothing at
 * all - forever - and nothing recorded that they hadn't. The messages sent
 * through here include a rejected credential, an application decision and a
 * released payment, so a silent channel is not an acceptable one.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type Prisma = import("@prisma/client").PrismaClient;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  badge?: number;
}

/** Expo's per-message ticket. Only the parts we act on are typed. */
interface PushTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

/**
 * Fire-and-forget push to one or more Expo push tokens.
 * Invalid tokens (non-Expo, empty) are dropped before sending.
 * Network failures are logged but never thrown: push is always best-effort.
 *
 * If `prismaClient` is given, Expo's reply is read and any token it reports as
 * DeviceNotRegistered is cleared. Without that, a token that dies - app
 * uninstalled, notification permission revoked, token rotated - stays on the
 * user row forever, and every later send burns a request on a destination that
 * cannot exist. Expo returns tickets positionally, so the response index maps
 * back to the message that produced it.
 */
export function sendPush(messages: PushMessage[], prismaClient?: Prisma): void {
  const valid = messages.filter(
    (m) => typeof m.to === "string" && m.to.startsWith("ExponentPushToken[")
  );
  if (valid.length === 0) return;

  fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(valid.length === 1 ? valid[0] : valid),
  })
    .then(async (res) => {
      if (!prismaClient) return;
      const payload = (await res.json().catch(() => null)) as { data?: PushTicket | PushTicket[] } | null;
      if (!payload?.data) return;
      // Expo returns a bare object for a single message and an array for a batch.
      const tickets = Array.isArray(payload.data) ? payload.data : [payload.data];
      const dead = valid
        .filter((_, i) => tickets[i]?.status === "error" && tickets[i]?.details?.error === "DeviceNotRegistered")
        .map((m) => m.to);
      if (dead.length === 0) return;
      await prismaClient.user.updateMany({
        where: { pushToken: { in: dead } },
        data: { pushToken: null },
      });
    })
    .catch((e) => console.error("[push] delivery error:", e));
}

export type NotifPref = "notifTasks" | "notifPay";

/**
 * Notify one worker: record it in their inbox, then try to push it.
 *
 * The preference gates the PUSH ONLY, never the record. A worker turning off
 * task notifications is asking not to be interrupted, not asking to be kept in
 * the dark about their own application - and the inbox is what makes it
 * possible to honour the first without doing the second.
 *
 * Await this rather than floating it with `void`: the inbox write is the part
 * that has to have happened before the route responds. Only the push inside is
 * fire-and-forget.
 */
export async function notifyWorker(
  prismaClient: Prisma,
  workerId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  pref?: NotifPref
): Promise<void> {
  const user = await prismaClient.user.findUnique({
    where: { id: workerId },
    select: { pushToken: true, notifTasks: true, notifPay: true },
  });
  if (!user) return;

  await prismaClient.notification.create({
    data: { userId: workerId, title, body, data: data ? JSON.stringify(data) : null },
  });

  if (!user.pushToken) return;
  if (pref && !user[pref]) return;
  sendPush([{ to: user.pushToken, title, body, data, sound: "default" }], prismaClient);
}

/**
 * Notify a batch of workers (e.g. release-all).
 *
 * Every worker gets the inbox record; only those with a live token and the
 * relevant preference enabled also get a push. Previously the query itself
 * filtered on `pushToken: { not: null }`, so a worker without one was not just
 * skipped for push - they were never considered at all.
 */
export async function notifyWorkers(
  prismaClient: Prisma,
  workerIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  pref?: NotifPref
): Promise<void> {
  if (workerIds.length === 0) return;
  const users = await prismaClient.user.findMany({
    where: { id: { in: workerIds } },
    select: { id: true, pushToken: true, notifTasks: true, notifPay: true },
  });
  if (users.length === 0) return;

  const serialised = data ? JSON.stringify(data) : null;
  await prismaClient.notification.createMany({
    data: users.map((u) => ({ userId: u.id, title, body, data: serialised })),
  });

  const messages = users
    .filter((u) => u.pushToken && (!pref || u[pref]))
    .map((u) => ({ to: u.pushToken!, title, body, data, sound: "default" as const }));
  sendPush(messages, prismaClient);
}
