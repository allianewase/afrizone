-- Store premises audits (Blueprint §8).
--
-- A store goes apply -> audit -> approve -> live on the map. The audit is the
-- middle step and it is real work: a qualified Auditor physically visits,
-- verifies and scores the premises, and their finding is what an admin approves
-- or refuses on. Without a durable record, "why was this store approved?" is
-- answerable only by whoever clicked the button.
--
-- THE AUDIT IS ITSELF A TASK, which is why Task grows two columns rather than
-- this being a standalone workflow. It is paid work, it has to be claimed, and
-- it can only be claimed by somebody carrying an auditor credential - all of
-- which the task and eligibility machinery already does. StoreAudit records the
-- OUTCOME; the Task records the work.
--
-- Task.kind is Blueprint §12's `type`, defaulting GENERAL because that is what
-- every task that exists at this point is. It is deliberately NOT `category`,
-- which is a free-text label an admin types and which drives nothing: renaming
-- a category must never change behaviour, and code branches on `kind` alone.
--
-- Task.organizationId is the business a task is ABOUT - the store being audited,
-- and later the store an order is collected from. Not who created it, and not
-- who gets paid for it.
--
-- StoreAudit.outcome is stored separately from the score on purpose. The pass
-- threshold is a policy that will move, and an outcome computed at read time
-- would silently rewrite what an old audit meant when it was made.
--
-- Purely additive: two nullable/defaulted columns and one new table. Nothing
-- rewritten, nothing to backfill.
--
-- DDL copied verbatim from `prisma migrate diff --from-empty`.

ALTER TABLE "Task" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "Task" ADD COLUMN "organizationId" TEXT;

CREATE TABLE "StoreAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT,
    "auditorId" TEXT,
    "score" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreAudit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StoreAudit_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StoreAudit_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "StoreAudit_organizationId_createdAt_idx" ON "StoreAudit"("organizationId", "createdAt");

-- "Which audit tasks are open?" and "what is this store's task?" are both
-- lookups the admin approval screen makes.
CREATE INDEX "Task_kind_organizationId_idx" ON "Task"("kind", "organizationId");
