-- AuditLog.actorId was NOT NULL with a foreign key to User, so only a
-- logged-in human could ever be recorded as an actor. Any system-initiated
-- action - a webhook, a scheduled job, an integration - failed its audit
-- insert outright, which makes the automated half of the platform
-- unauditable. That is a hard blocker for the fulfilment work, where most
-- state changes are system-initiated.
--
-- SQLite cannot drop a NOT NULL or alter a foreign key in place, so the table
-- is rebuilt. Nothing references AuditLog with a foreign key, so this is safe.
--
-- Existing rows are all human-initiated, so they backfill to actorType 'USER'
-- with a NULL actorRef, which is exactly what they were.
--
-- The CHECK enforces the real invariant: every row must be attributable to
-- someone or something - a USER row must name a user, and a non-USER row must
-- name a ref.

PRAGMA foreign_keys=OFF;

CREATE TABLE "AuditLog_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "actorRef" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_actor_attributable" CHECK (
        ("actorType" = 'USER' AND "actorId" IS NOT NULL)
        OR ("actorType" <> 'USER' AND "actorRef" IS NOT NULL)
    )
);

INSERT INTO "AuditLog_new" ("id", "actorId", "actorType", "actorRef", "action", "entity", "entityId", "meta", "createdAt")
SELECT "id", "actorId", 'USER', NULL, "action", "entity", "entityId", "meta", "createdAt" FROM "AuditLog";

DROP TABLE "AuditLog";
ALTER TABLE "AuditLog_new" RENAME TO "AuditLog";

CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

PRAGMA foreign_keys=ON;
