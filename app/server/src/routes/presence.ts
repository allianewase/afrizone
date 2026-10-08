/**
 * Going online, staying online, going offline (services/ranking.ts).
 *
 * A courier is offered orders first only while they have said they want work
 * and the app has said where they are. Both halves are the courier's choice:
 * nothing here runs unless they tap "Go online", and tapping "Go offline"
 * deletes the row rather than flagging it.
 *
 * THE APP SENDS A HEARTBEAT, AND SILENCE MEANS OFFLINE. A phone that dies, loses
 * signal for half an hour or is simply put in a pocket with the app closed
 * stops sending, and after PRESENCE_TTL_MINUTES the courier is no longer ranked
 * - nobody has to remember to go offline for the platform to stop treating them
 * as available. The per-minute cron deletes the stale row.
 */
import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireAccountType, AuthedRequest } from "../auth";
import { isValidCoord } from "../util/geo";
import { PRESENCE_TTL_MINUTES, presenceCutoff } from "../services/ranking";

const router = Router();

/** The row as the courier sees it. Their own position is not echoed back. */
function view(row: { onlineSince: Date; seenAt: Date } | null, now: Date) {
  const live = row !== null && row.seenAt >= presenceCutoff(now);
  return {
    online: live,
    onlineSince: live ? row!.onlineSince : null,
    seenAt: live ? row!.seenAt : null,
    // When the platform will stop treating them as online if the app goes quiet.
    expiresAt: live ? new Date(row!.seenAt.getTime() + PRESENCE_TTL_MINUTES * 60_000) : null,
    ttlMinutes: PRESENCE_TTL_MINUTES,
  };
}

/** GET /api/me/presence -> am I online? */
router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  const row = await prisma.courierPresence.findUnique({ where: { userId: req.user!.id } });
  res.json(view(row, new Date()));
});

/**
 * PUT /api/me/presence -> go online, or say I still am. Body {lat, lng}.
 *
 * The same call does both, so the app has one thing to send on a timer. A
 * heartbeat after the row has lapsed starts a new session rather than
 * continuing the old one: half an hour of silence was not being online.
 */
router.put("/", requireAuth, requireAccountType("COURIER"), async (req: AuthedRequest, res: Response) => {
  const { lat, lng } = req.body ?? {};
  if (!isValidCoord(lat, lng)) {
    return res.status(400).json({
      error: "Turn on location to go online - orders are offered to the couriers nearest the shop",
      code: "NO_LOCATION",
    });
  }

  const now = new Date();
  const existing = await prisma.courierPresence.findUnique({ where: { userId: req.user!.id } });
  const continuing = existing !== null && existing.seenAt >= presenceCutoff(now);

  const row = await prisma.courierPresence.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, lat: Number(lat), lng: Number(lng), onlineSince: now, seenAt: now },
    update: {
      lat: Number(lat),
      lng: Number(lng),
      seenAt: now,
      ...(continuing ? {} : { onlineSince: now }),
    },
  });
  res.json(view(row, now));
});

/** DELETE /api/me/presence -> go offline. The position goes with it. */
router.delete("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  await prisma.courierPresence.deleteMany({ where: { userId: req.user!.id } });
  res.json(view(null, new Date()));
});

export default router;
