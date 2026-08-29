-- Delivery: the one thing keeping `order.confirmed` DEFERRED (MART_INTEGRATION.md
-- §3.1, §4; Blueprint §5, §12).
--
-- Every order Mart has confirmed since the event bus shipped sits in `MartEvent`
-- with status DEFERRED and the note "Delivery is not built yet. Recorded for
-- replay." This table is what they replay INTO.
--
-- WHY A TABLE AT ALL, when a delivery is "just a task". Three things about an
-- order have nowhere to go on `Task`:
--
--   A SECOND LOCATION. A task has one site. A delivery has a shop to collect
--   from and a door to knock on, and the distance between them is the work.
--
--   A PROGRESS AXIS THAT IS NOT THE COURIER'S. `Task.status` is the posting and
--   `Contract.status` is one person's engagement, and neither can express "the
--   store has not accepted this yet" - a state that exists before any courier
--   is involved and may end the order without one. Three axes is one more than
--   anybody wants; the alternative was overloading a courier's work lifecycle
--   with a shop's decision, which makes "did the rider fail, or did the store
--   refuse?" unanswerable.
--
--   CUSTOMER DATA WITH AN EXPIRY. §5 commits us to deleting the customer's name,
--   number and door seven days after the order finishes. Data with a deletion
--   date needs to live in one place that can be found and emptied, not smeared
--   across a task description.
--
-- THE PICKUP IS COPIED, NOT JOINED. `organizationId` says which store this is,
-- and the address next to it says where the courier actually went. A store that
-- moves or is renamed must not rewrite the history of deliveries already made.
CREATE TABLE "Delivery" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  -- Mart's order number, and the de-duplication key: one order, one fulfilment
  -- job, forever. Not `eventId` - Mart may legitimately re-confirm an order
  -- under a new event id, and that must find this row rather than make a second.
  "martOrderId" TEXT NOT NULL,
  -- The store fulfilling. Resolved from `fulfilment.storeSlug` at intake; an
  -- unknown slug fails the event rather than creating a headless order.
  "organizationId" TEXT NOT NULL,
  -- The courier posting, once there is one. NULL until the store accepts:
  -- posting work to collect from a shop that has not agreed to pack it sends a
  -- rider to a closed door.
  "taskId"      TEXT,

  -- CONSIGNMENT | OWN_STOCK. The field MART_INTEGRATION.md exists for: it
  -- decides whether the store is owed a settlement line, PartTime cannot infer
  -- it, and an absent value is rejected rather than defaulted.
  "stockSource" TEXT NOT NULL,
  -- The line items as sent, JSON, verbatim. Stored rather than parsed into rows
  -- because PartTime never reasons about them - it hands a courier a list.
  "items"       TEXT NOT NULL DEFAULT '[]',

  -- Where the goods are, copied from the store at intake. Nullable because a
  -- store row may genuinely lack coordinates; the courier still gets an address.
  "pickupAddress" TEXT,
  "pickupLat"     REAL,
  "pickupLng"     REAL,

  -- Where they are going. NULLABLE, which is not the same as optional: an order
  -- without a destination is refused at intake (see parseOrder). It is nullable
  -- because §5 commits us to DELETING the customer's door seven days after the
  -- order finishes, and "deleted means DELETE - not a flag, not a filtered
  -- query". A NOT NULL column would force the purge to write a placeholder, and
  -- a row that says "[removed]" is a row that still has to be trusted not to
  -- have said something else.
  --
  -- The coordinates are optional for a different reason: a rider can find "14
  -- Adeniran Ogunsanya" and a wrong pin is worse than no pin.
  "dropoffAddress"      TEXT,
  "dropoffLat"          REAL,
  "dropoffLng"          REAL,
  "dropoffInstructions" TEXT,

  -- The whole of what §5 lets us hold about a person who has no PartTime
  -- account. Nulled out by the purge, which is why they are nullable on a row
  -- where they always start present.
  "customerName"  TEXT,
  "customerPhone" TEXT,
  -- When the purge ran. NOT a flag saying "hidden": the columns above are
  -- actually emptied, and this records that it happened so a purge that never
  -- ran is distinguishable from one that ran and found nothing.
  "customerPurgedAt" DATETIME,

  -- Whole Naira, both. `deliveryFee` is what MART charged the customer, and is
  -- NOT what the courier is paid - that comes from rules.DELIVERY.fee, which an
  -- admin sets. Mart changing its pricing must never change our payroll.
  "goodsTotal"  INTEGER NOT NULL DEFAULT 0,
  "deliveryFee" INTEGER NOT NULL DEFAULT 0,
  "expectedBy"  DATETIME,

  -- RECEIVED | STORE_ACCEPTED | PREPARED | COURIER_ASSIGNED | PICKED_UP |
  -- DELIVERED | STORE_REJECTED | FAILED | CANCELLED.
  -- See src/services/delivery.ts for the legal moves.
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',

  -- One timestamp per leg rather than a status-history table. These are the
  -- questions operations actually asks - how long did the store take, how long
  -- did it sit unclaimed - and they are answerable here with arithmetic. The
  -- full trail is in AuditLog, which every transition writes to.
  "storeDecidedAt" DATETIME,
  "storeNote"      TEXT,
  "preparedAt"     DATETIME,
  "assignedAt"     DATETIME,
  "pickedUpAt"     DATETIME,
  "deliveredAt"    DATETIME,
  "failedAt"       DATETIME,
  "failureReason"  TEXT,

  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Delivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id"),
  CONSTRAINT "Delivery_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id")
);

-- One order, one fulfilment job.
CREATE UNIQUE INDEX "Delivery_martOrderId_key" ON "Delivery"("martOrderId");
-- One task is one delivery. A second delivery pointing at the same posting
-- would mean two orders and one courier slot.
CREATE UNIQUE INDEX "Delivery_taskId_key" ON "Delivery"("taskId");
-- "What is waiting on my store?" - the portal's whole queue is this pair.
CREATE INDEX "Delivery_organizationId_status_idx" ON "Delivery"("organizationId", "status");
-- "What is stuck?" - the operations board, across every store.
CREATE INDEX "Delivery_status_idx" ON "Delivery"("status");
-- The purge sweeps finished orders by age. Without this it is a full scan that
-- grows for as long as the platform runs.
CREATE INDEX "Delivery_status_updatedAt_idx" ON "Delivery"("status", "updatedAt");
