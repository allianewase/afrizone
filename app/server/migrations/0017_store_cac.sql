-- CAC registration for stores (Blueprint §15: Store sign-up & KYC).
--
-- The Corporate Affairs Commission is Nigeria's company registry. A store
-- claiming to be a registered business is a claim PartTime pays money against,
-- so it gets the same treatment as a worker's ID: a number, a check, a verdict
-- by a named person, and a note saying why.
--
-- FOUR COLUMNS, NOT ONE. A single `cacVerified` boolean cannot express the state
-- every real queue spends most of its time in - submitted, not yet decided - and
-- a store sitting in that state is indistinguishable from one that never
-- supplied a number at all. Those need different people to act.
--
-- `cacStatus` defaults UNVERIFIED for every existing row, which is the honest
-- value: nothing has been checked. It deliberately does NOT gate approval today.
-- Stores are already live in the pilot without a CAC number, and a column added
-- on Tuesday must not suspend them on Wednesday. Enforcement is a separate
-- decision, taken when the queue has been worked.
--
-- `cacName` holds the name the registry returns, which is the whole reason to
-- check a number rather than store it. A mismatch against `name` is shown to the
-- reviewer as a warning, never actioned automatically - "Mama Nkechi Provisions"
-- against "M. NKECHI PROVISIONS LTD" is the normal case, not fraud.

ALTER TABLE "Organization" ADD COLUMN "cacNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN "cacStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE "Organization" ADD COLUMN "cacName" TEXT;
ALTER TABLE "Organization" ADD COLUMN "cacCheckedAt" DATETIME;
ALTER TABLE "Organization" ADD COLUMN "cacNote" TEXT;

-- "What is waiting on me?" is the only question the review screen asks, and it
-- filters on exactly this.
CREATE INDEX "Organization_cacStatus_idx" ON "Organization"("cacStatus");

-- Two stores cannot be the same registered company.
--
-- Plain rather than partial, deliberately. SQLite already treats NULLs as
-- distinct in a unique index, so every store without a number is unaffected
-- without a WHERE clause - and a partial index is the one thing here Prisma
-- cannot express. Local dev builds its database from schema.prisma via
-- `prisma db push`, so anything only this file knows about would exist in
-- production and not locally, which is how a duplicate gets accepted in dev and
-- rejected on deploy.
CREATE UNIQUE INDEX "Organization_cacNumber_key" ON "Organization"("cacNumber");
