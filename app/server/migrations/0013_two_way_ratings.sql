-- Ratings become two-way (Blueprint §9).
--
-- Until now a Rating could only ever be Afrizone rating a Tasker: `workerId`
-- was always the subject and the unique constraint was (workerId, taskId), so
-- one engagement could carry exactly one rating. §9 wants the Tasker to rate the
-- experience back, which needs a second row on the same engagement.
--
-- `direction` DEFAULTS 'OF_WORKER', and that is correct rather than merely
-- convenient: every row that exists at this point is precisely that.
--
-- THE OLD UNIQUE INDEX IS THE THING BEING FIXED, not incidental cleanup. Leaving
-- (workerId, taskId) in place would reject the Tasker's rating as a duplicate of
-- the one already there, which is exactly the bug this migration exists to
-- remove. Dropping and recreating is safe here: the new constraint is strictly
-- wider, so nothing that was legal becomes illegal.
--
-- WORTH KNOWING FOR ANY CODE THAT READS THIS TABLE: `workerId` is the worker in
-- the engagement in BOTH directions - the subject when OF_WORKER, the author
-- when OF_EXPERIENCE. So a query that averages "ratings where workerId = X" now
-- silently mixes in ratings that person WROTE. Every such read has to filter on
-- direction, and `User.rating` is the one that matters: it is the number shown
-- on a profile and used to rank people.
--
-- Column and index DDL copied verbatim from `prisma migrate diff --from-empty`.

ALTER TABLE "Rating" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'OF_WORKER';

DROP INDEX IF EXISTS "Rating_workerId_taskId_key";

CREATE UNIQUE INDEX "Rating_workerId_taskId_direction_key" ON "Rating"("workerId", "taskId", "direction");
