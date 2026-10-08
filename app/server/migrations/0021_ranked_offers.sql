-- Ranked offers: a delivery goes to the best-placed courier first
-- (Blueprint §11, MART_INTEGRATION.md §6 D4).
--
-- Until now an order went on the board to everyone qualified inside a circle
-- that widened with time, and the first to tap took it. Now, before the circle
-- opens, the order is offered to the top few online couriers one at a time,
-- each for a short exclusive window. See services/ranking.ts and
-- services/deliveryOffer.ts.
--
-- WHY A PRESENCE TABLE, WHEN deliveryOffer.ts ARGUED AGAINST ONE. Ranking by
-- proximity means knowing where couriers are before any of them asks, and
-- nothing else can answer that. The design keeps the cost as small as it can:
-- one row per courier, overwritten in place (no trail), only while they have
-- chosen to be online, deleted on going offline and swept when stale.
CREATE TABLE "CourierPresence" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "onlineSince" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourierPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CourierPresence_seenAt_idx" ON "CourierPresence"("seenAt");

-- The ranked list is frozen when the order goes on the board. NULL for every
-- existing row is correct: an order with no list behaves exactly as before.
ALTER TABLE "Delivery" ADD COLUMN "rankedCandidates" TEXT;
-- Push notifications are events, so this one counter is stored. Everything
-- else about the ranked phase is derived from offeredAt.
ALTER TABLE "Delivery" ADD COLUMN "rankedNotified" INTEGER NOT NULL DEFAULT 0;
