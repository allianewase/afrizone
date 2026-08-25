-- The durable in-app notification record. See the Notification model in
-- prisma/schema.prisma for why it exists: push delivery silently fails for any
-- worker who declined the permission, and the messages sent through it now
-- include ones that cost a worker money or standing.
--
-- Additive only - a new table, no existing table touched, so there is nothing
-- to backfill and no ordering hazard against other migrations. It must still
-- be applied BEFORE the code that writes to it, per the same rule as 0002,
-- 0003 and 0004.
--
-- DDL copied verbatim from `prisma migrate diff --from-empty`, so the
-- hand-written migration and schema.prisma cannot describe different tables.

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- The inbox list: one worker's notifications, newest first.
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
-- The unread badge, polled far more often than the list is opened.
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
