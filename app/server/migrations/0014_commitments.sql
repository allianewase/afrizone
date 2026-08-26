-- Escrow as state (Blueprint §10).
--
-- AfriZoneMart holds the money throughout. This table records that a specific
-- amount is ring-fenced against a specific engagement and that it became
-- payable on acceptance. The worker-facing promise is identical to custodial
-- escrow - their pay is ring-fenced the moment the contract goes live - while
-- Part-Time stays a ledger rather than a regulated payments business holding a
-- float it has to reconcile. See MART_INTEGRATION.md §7.
--
-- WHY THIS IS NOT Payment. Payment is created at ACCEPTANCE, is worker-only, and
-- carries withholding tax because it is wages. A Commitment is created when the
-- contract goes LIVE, can be owed to an organization as easily as a person, and
-- carries no tax - a store selling goods is not earning wages, and withholding
-- 5% from it would be wrong. The two coexist: the Commitment is the promise, the
-- Payment is the wage calculation.
--
-- `amount` IS NULLABLE ON PURPOSE. A FIXED task has a budget, so the ring-fence
-- is exact from the start. An HOURLY one cannot be known until hours are
-- submitted, so it is committed with no figure and trued up on acceptance.
-- Inventing an estimate would put a number in front of a worker that nobody
-- promised them, and a wrong number about money is worse than an honest absence.
--
-- The unique (contractId, reason) is not decoration: without it a retried
-- endpoint accumulates duplicate ring-fences against one contract, and the
-- wallet then tells a worker they are owed twice.
--
-- Purely additive - one new table, nothing altered, nothing to backfill.
-- Table and index DDL copied verbatim from `prisma migrate diff --from-empty`.

CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'COMMITTED',
    "workerId" TEXT,
    "organizationId" TEXT,
    "contractId" TEXT,
    "martOrderId" TEXT,
    "amount" INTEGER,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "committedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    "paidAt" DATETIME,
    "cancelledAt" DATETIME,
    CONSTRAINT "Commitment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Commitment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Commitment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Commitment_workerId_status_idx" ON "Commitment"("workerId", "status");
CREATE INDEX "Commitment_organizationId_status_idx" ON "Commitment"("organizationId", "status");
CREATE UNIQUE INDEX "Commitment_contractId_reason_key" ON "Commitment"("contractId", "reason");
