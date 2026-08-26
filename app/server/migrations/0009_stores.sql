-- Stores as their own entity, not as User rows.
--
-- Purely additive: two new tables, nothing altered, nothing to backfill. No
-- existing code reads either of them, so this is inert on arrival and can sit
-- applied while the rest is built - same shape as 0008. Applied to production
-- BEFORE the code that reads it, per the rule 0002-0008 all followed.
--
-- WHY A STORE IS NOT A USER, which is the whole reason this migration exists:
-- a store has several staff who each log in as themselves, one bank account
-- belonging to the store rather than to any employee, one location, and a
-- lifecycle (approved, suspended) independent of any person. Modelling it as a
-- User row works for exactly as long as one person runs one store, and every
-- foreign key added in the meantime points at the wrong table. Introducing the
-- table first is what stops that accumulating.
--
-- StoreMember is a join table rather than a `User.storeId` column because the
-- relationship is genuinely many-to-many: one person can run more than one
-- branch. A column would force a migration the first time that happens, and
-- would make "which store am I acting as?" unanswerable rather than merely
-- awkward. The unique (storeId, userId) pair is also what makes the row-level
-- ownership check one indexed lookup - and that check, not the account type,
-- is what stops one store reading another store's orders.
--
-- Store.status DEFAULTS 'PENDING' deliberately. A store that could receive
-- orders the moment somebody typed its name in would be a hole, not a
-- convenience; Afrizone approves it into ACTIVE.
--
-- Table and index DDL copied verbatim from `prisma migrate diff --from-empty`.

CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "lat" REAL,
    "lng" REAL,
    "bankAccountNumber" TEXT,
    "bankCode" TEXT,
    "bankName" TEXT,
    "bankMasked" TEXT,
    "tin" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "StoreMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreMember_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StoreMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");
CREATE INDEX "StoreMember_userId_idx" ON "StoreMember"("userId");
CREATE UNIQUE INDEX "StoreMember_storeId_userId_key" ON "StoreMember"("storeId", "userId");
