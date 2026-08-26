-- The ledger of everything AfriZoneMart tells us (Blueprint §5).
--
-- Mart emits facts; PartTime subscribes and runs task-generation rules. This
-- table is that subscription's memory, and it exists for three separate reasons.
-- Only the first is obvious:
--
--   IDEMPOTENCY. Mart retries on a timeout, a 500, or a deploy that killed an
--   in-flight request, and a retry has to be free. `eventId` is unique, so a
--   repeat is recognised rather than acted on twice. This is the constraint the
--   integration spec insists must exist in the FIRST commit that accepts
--   events - adding it after duplicates are in production means reconciling
--   them by hand.
--
--   NOTHING IS LOST WHILE DOWNSTREAM WORK IS UNBUILT. An order.confirmed today
--   creates no dispatch task, because delivery does not exist yet. Recording it
--   as DEFERRED means those orders can be replayed the day it does, rather than
--   having been dropped on the floor behind a 200.
--
--   ANSWERING "WHY IS THERE NO TASK FOR THIS?". Without a row per event, "Mart
--   never sent it", "we de-duplicated it" and "no rule matched" are
--   indistinguishable, and each is a different bug with a different fix.
--
-- `payload` is stored verbatim rather than shredded into columns. A replay must
-- see exactly what arrived, and a schema that has since moved on must not
-- silently reinterpret an old event.
--
-- Purely additive: one new table, nothing altered, nothing to backfill.
-- DDL copied verbatim from `prisma migrate diff --from-empty`.

CREATE TABLE "MartEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "resultTaskId" TEXT,
    "note" TEXT
);

CREATE UNIQUE INDEX "MartEvent_eventId_key" ON "MartEvent"("eventId");
CREATE INDEX "MartEvent_type_status_idx" ON "MartEvent"("type", "status");
CREATE INDEX "MartEvent_receivedAt_idx" ON "MartEvent"("receivedAt");
