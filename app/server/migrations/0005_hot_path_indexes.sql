-- Index-only migration. No table is rebuilt, no column changes, nothing in
-- the application depends on it, so unlike 0002/0003/0004 the ordering
-- against the code deploy does not matter.
--
-- Five tables carried ZERO indexes other than their primary key: Application,
-- Task, Contract, ClockEvent, Timesheet, Payment. Every filter on them was a
-- full table scan.
--
-- The worst of these is not the slowest single query - it is GET /api/tasks,
-- which counts applications twice per task in a loop. With no index on
-- Application that is two full scans of the whole applications table for
-- EVERY task in the list, so the cost grows with tasks x applications rather
-- than with either one. It is the endpoint the worker app opens on, and the
-- one that degrades first as the pilot takes on workers.
--
-- Every index below corresponds to a filter that exists in src/ today; none
-- is speculative. Column order matters in SQLite - a composite index serves a
-- query on its leading columns, so (taskId, status) also serves a bare taskId
-- filter, and no separate single-column index is needed for it.

-- Application: the hot table.
--   (taskId, status)   routes/tasks.ts, applications.ts approve, me.ts
--                      - also covers the bare {taskId} count
--   (workerId, status) me.ts "my applications"
--   (taskId, workerId) the duplicate-application guard, and the assignment
--                      gate in util/assignment.ts, which now runs on every
--                      clock event and timesheet submission
CREATE INDEX "Application_taskId_status_idx" ON "Application"("taskId", "status");
CREATE INDEX "Application_workerId_status_idx" ON "Application"("workerId", "status");
CREATE INDEX "Application_taskId_workerId_idx" ON "Application"("taskId", "workerId");

-- Task: dashboard counts by status.
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- Contract: minted per approval, read per worker.
CREATE INDEX "Contract_taskId_workerId_idx" ON "Contract"("taskId", "workerId");
CREATE INDEX "Contract_workerId_idx" ON "Contract"("workerId");

-- ClockEvent: grows fastest of all of these - two rows per worker per shift -
-- and is read on every open of the active-task screen to resume clock state.
-- createdAt is in the index rather than just the two filter columns because
-- both readers take the LATEST event and would otherwise sort the matches in
-- a temp B-tree; with it, the planner walks the index backwards and stops at
-- the first row.
CREATE INDEX "ClockEvent_workerId_taskId_createdAt_idx" ON "ClockEvent"("workerId", "taskId", "createdAt");

-- Timesheet: the admin approval queue filters by status; workers read their own.
CREATE INDEX "Timesheet_status_idx" ON "Timesheet"("status");
CREATE INDEX "Timesheet_workerId_idx" ON "Timesheet"("workerId");

-- Payment: the release queue filters by status; the wallet reads every
-- payment for one worker on each load.
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "Payment_workerId_idx" ON "Payment"("workerId");
