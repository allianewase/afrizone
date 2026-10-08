-- Proof-of-work evidence: photos with where and when (Blueprint §14).
--
-- Until now a finished job was the worker saying so: a timesheet submitted, a
-- delivery marked collected, an audit score typed in. Now each of those needs
-- a photo taken at the right moment, and the photo carries its position and
-- time so most of the checking a reviewer would do is done on arrival. See
-- services/evidence.ts for what each kind of task requires, and the model's
-- doc comment for why a failed check flags rather than refuses.
--
-- A drop-off photo shows a customer's door. It is customer data under
-- MART_INTEGRATION.md §5 and is deleted with the rest of it by the delivery
-- purge, seven days after the order ends.
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "lat" REAL,
    "lng" REAL,
    "accuracyMetres" REAL,
    "capturedAt" DATETIME,
    "distanceMetres" REAL,
    "flags" TEXT,
    "clockEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Evidence_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Evidence_objectKey_key" ON "Evidence"("objectKey");
CREATE UNIQUE INDEX "Evidence_clockEventId_key" ON "Evidence"("clockEventId");
CREATE INDEX "Evidence_taskId_workerId_stage_idx" ON "Evidence"("taskId", "workerId", "stage");
CREATE INDEX "Evidence_workerId_createdAt_idx" ON "Evidence"("workerId", "createdAt");
