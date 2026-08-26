-- The work lifecycle moves onto Contract.status.
--
-- Blueprint §4.2 asks for the task lifecycle to be modelled explicitly "so
-- payment, disputes and analytics all hang off clean transitions". Contract is
-- where it belongs: §12 defines Contract as the thing that "binds Task to
-- Tasker", and the states that matter - Claimed, In Progress, Submitted,
-- Verified, Paid - are facts about ONE PERSON doing the work, not about the
-- posting. A task with five slots has one posting and five engagements moving
-- independently, so putting these on Task would pin slots to 1 forever.
--
-- WHAT Contract.status USED TO MEAN. It held the SIGNATURE state -
-- PENDING_SIGNATURE or SIGNED. That is a different question from how far the
-- work has got, and conflating them is why a signed contract could not say
-- whether anyone had started. Signature now reads from signedAt, which already
-- exists and is already populated; status is free for the lifecycle.
--
-- THE BACKFILL IS DERIVED, NOT GUESSED. Every existing row is placed by what
-- the database can prove about it, in order of strength:
--
--   a released Payment          -> PAID       (money already moved)
--   an APPROVED Timesheet       -> VERIFIED   (acceptance already happened)
--   any Timesheet               -> SUBMITTED  (work was handed in)
--   any ClockEvent              -> IN_PROGRESS(somebody started)
--   nothing                     -> CLAIMED    (assigned, not started)
--
-- The ordering matters: a contract with both a clock-in and an approved
-- timesheet is VERIFIED, not IN_PROGRESS, so the strongest evidence is applied
-- last and wins. This is the first data-modifying migration in the project;
-- every prior one was additive. It is safe because every branch is derived from
-- rows that already exist, and CLAIMED - the fallback - is the state that
-- assumes the least.
--
-- EXPIRED IS ABSENT ON PURPOSE. §4.2 lists it, but a posting nobody claimed
-- before its deadline is expired by the passage of time rather than by anything
-- anyone did. It is derived at read time from Task.deadline, exactly as
-- credential expiry is derived (see ARCHITECTURE.md §12). Stored, it would need
-- a scheduled job, and a job that fails to run leaves a dead task looking live.
--
-- No columns are added or dropped. Only Contract.status values change.

-- Weakest evidence first, so stronger evidence overwrites it.
UPDATE "Contract" SET "status" = 'CLAIMED';

UPDATE "Contract" SET "status" = 'IN_PROGRESS'
WHERE EXISTS (
  SELECT 1 FROM "ClockEvent" ce
  WHERE ce."taskId" = "Contract"."taskId" AND ce."workerId" = "Contract"."workerId"
);

UPDATE "Contract" SET "status" = 'SUBMITTED'
WHERE EXISTS (
  SELECT 1 FROM "Timesheet" ts
  WHERE ts."taskId" = "Contract"."taskId" AND ts."workerId" = "Contract"."workerId"
);

UPDATE "Contract" SET "status" = 'VERIFIED'
WHERE EXISTS (
  SELECT 1 FROM "Timesheet" ts
  WHERE ts."taskId" = "Contract"."taskId" AND ts."workerId" = "Contract"."workerId"
    AND ts."status" = 'APPROVED'
);

UPDATE "Contract" SET "status" = 'PAID'
WHERE EXISTS (
  SELECT 1 FROM "Payment" p
  WHERE p."taskId" = "Contract"."taskId" AND p."workerId" = "Contract"."workerId"
    AND p."status" = 'RELEASED'
);

-- Every contract's lifecycle is read constantly once this is wired: "what is
-- this worker's current state on this task?" is the question the mobile active
-- screen and the admin queue both ask.
CREATE INDEX "Contract_status_idx" ON "Contract"("status");
