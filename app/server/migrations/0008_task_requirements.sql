-- Task requirements and the eligibility gate.
--
-- Additive: three ALTER TABLE ... ADD COLUMN with defaults, plus two new join
-- tables. Nothing is rewritten and there is nothing to backfill. Applied to
-- production BEFORE the code that reads it, per the same rule as 0002-0007.
--
-- requiresIdentityVerified DEFAULTS FALSE, and that is the important line in
-- this file. Defaulting it true would silently gate every task already live in
-- the pilot at the moment this migration lands - workers who could apply
-- yesterday would find they cannot, with no admin having decided anything. The
-- admin form defaults the toggle ON for NEW tasks instead, which is a
-- different thing and is safe: a person is choosing it, on a task nobody has
-- applied to yet.
--
-- Two narrow join tables rather than one polymorphic table or a JSON column:
-- the live qualifying-count an admin sees while building a task must be
-- index-usable, and "which open tasks require this skill?" has to be a plain
-- indexed lookup when a skill is retired, not a scan with a discriminator.
--
-- No cron trigger is added anywhere. Credential expiry is computed at read
-- time (see the Credential model), so nothing has to run on a schedule for
-- this gate to stay correct.
--
-- Table DDL copied verbatim from `prisma migrate diff --from-empty`.

ALTER TABLE "Task" ADD COLUMN "requiresIdentityVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "requirementsSummary" TEXT;
ALTER TABLE "Task" ADD COLUMN "requirementsVersion" INTEGER NOT NULL DEFAULT 0;

-- What was true about the worker when the application was accepted. Credentials
-- expire, so "were they eligible at the time?" cannot be reconstructed from
-- current state later - and that is exactly the question asked when something
-- goes wrong on a job.
ALTER TABLE "Application" ADD COLUMN "eligibilitySnapshot" TEXT;

CREATE TABLE "TaskSkillRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    CONSTRAINT "TaskSkillRequirement_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskSkillRequirement_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "TaskCredentialRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "credentialTypeId" TEXT NOT NULL,
    CONSTRAINT "TaskCredentialRequirement_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TaskCredentialRequirement_credentialTypeId_fkey" FOREIGN KEY ("credentialTypeId") REFERENCES "CredentialType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "TaskSkillRequirement_skillId_idx" ON "TaskSkillRequirement"("skillId");
CREATE UNIQUE INDEX "TaskSkillRequirement_taskId_skillId_key" ON "TaskSkillRequirement"("taskId", "skillId");
CREATE INDEX "TaskCredentialRequirement_credentialTypeId_idx" ON "TaskCredentialRequirement"("credentialTypeId");
CREATE UNIQUE INDEX "TaskCredentialRequirement_taskId_credentialTypeId_key" ON "TaskCredentialRequirement"("taskId", "credentialTypeId");
