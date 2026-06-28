/**
 * Expo Push Notification Service — best-effort delivery via https://exp.host.
 * Routes through FCM (Android) and APNs (iOS) automatically.
 *
 * Env-driven: always active when a valid ExponentPushToken is stored.
 * No Firebase project credentials needed — Expo's relay handles delivery.
 * In production, swap for direct FCM/APNs or Expo's enhanced push service.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  badge?: number;
}

/**
 * Fire-and-forget push to one or more Expo push tokens.
 * Invalid tokens (non-Expo, empty) are silently dropped.
 * Network failures are logged but never thrown — push is always best-effort.
 */
export function sendPush(messages: PushMessage[]): void {
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
  }).catch((e) => console.error("[push] delivery error:", e));
}

export type NotifPref = "notifTasks" | "notifPay";

/**
 * Convenience: look up a single worker's push token and send if present.
 * Pass `pref` to gate on the worker's saved preference (default: always send).
 */
export async function notifyWorker(
  prismaClient: import("@prisma/client").PrismaClient,
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
  if (!user?.pushToken) return;
  if (pref && !user[pref]) return;
  sendPush([{ to: user.pushToken, title, body, data, sound: "default" }]);
}

/**
 * Convenience: notify a batch of workers (e.g. release-all).
 * Workers with the relevant pref disabled are silently skipped.
 */
export async function notifyWorkers(
  prismaClient: import("@prisma/client").PrismaClient,
  workerIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  pref?: NotifPref
): Promise<void> {
  if (workerIds.length === 0) return;
  const users = await prismaClient.user.findMany({
    where: { id: { in: workerIds }, pushToken: { not: null } },
    select: { pushToken: true, notifTasks: true, notifPay: true },
  });
  const messages = users
    .filter((u) => u.pushToken && (!pref || u[pref]))
    .map((u) => ({ to: u.pushToken!, title, body, data, sound: "default" as const }));
  sendPush(messages);
}
