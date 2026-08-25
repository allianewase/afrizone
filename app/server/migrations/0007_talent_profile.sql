-- Talent profile: skills and credentials. Four new tables, no existing table
-- touched, so there is nothing to backfill. Additive, but still applied to
-- production BEFORE the code that reads it, per the same rule as 0002-0006.
--
-- DDL copied verbatim from `prisma migrate diff --from-empty`, so the
-- hand-written migration and schema.prisma cannot describe different tables.
--
-- The design decision worth restating here, because it is the one a future
-- reader is most likely to try to "fix": SKILLS CARRY NO VERIFICATION STATE.
-- There is no verified column on WorkerSkill and that is deliberate. Skills
-- are for search, ranking and admin judgement; they never gate anything. A
-- "checked by us" badge on a skill that unlocks nothing is a promise the
-- interface makes and the eligibility engine breaks. Anything that must be
-- guaranteed is modelled as a CredentialType instead.
--
-- Likewise there is NO stored EXPIRED status on Credential. Expiry is derived
-- at read time from expiresAt, so a background job that fails to run can never
-- leave a lapsed licence reading as valid. A status that decays with the clock
-- must not be a stored value.

CREATE TABLE "Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "WorkerSkill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "years" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkerSkill_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkerSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CredentialType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "reviewMode" TEXT NOT NULL DEFAULT 'ADMIN_REVIEW',
    "issuerMode" TEXT NOT NULL DEFAULT 'THIRD_PARTY',
    "requiresExpiry" BOOLEAN NOT NULL DEFAULT false,
    "requiresReference" BOOLEAN NOT NULL DEFAULT false,
    "requiresFile" BOOLEAN NOT NULL DEFAULT true,
    "issuerHint" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Credential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "credentialTypeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuer" TEXT,
    "referenceNumber" TEXT,
    "issuedAt" DATETIME,
    "expiresAt" DATETIME,
    "documentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Credential_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Credential_credentialTypeId_fkey" FOREIGN KEY ("credentialTypeId") REFERENCES "CredentialType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Credential_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KycDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Credential_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

CREATE INDEX "WorkerSkill_skillId_idx" ON "WorkerSkill"("skillId");

CREATE UNIQUE INDEX "WorkerSkill_workerId_skillId_key" ON "WorkerSkill"("workerId", "skillId");

CREATE UNIQUE INDEX "CredentialType_slug_key" ON "CredentialType"("slug");

CREATE INDEX "Credential_credentialTypeId_status_expiresAt_idx" ON "Credential"("credentialTypeId", "status", "expiresAt");

CREATE INDEX "Credential_workerId_status_idx" ON "Credential"("workerId", "status");
