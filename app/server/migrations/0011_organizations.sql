-- Store and StoreMember become Organization and OrganizationMember, with a
-- `kind` discriminator: STORE | COURIER.
--
-- WHY THIS REVERSES 0009, TWO MIGRATIONS LATER. 0009 modelled a store on the
-- understanding that couriers would be individuals. They will mostly be - but
-- registered courier companies exist too, and a courier company needs exactly
-- what a store needs: several staff who log in as themselves, one bank account
-- belonging to the business, one location, and an Afrizone approval gate.
-- Building that second would have meant writing membership, approval,
-- verification and payout twice and maintaining two of each forever. What
-- actually differs between a store and a courier company is the work they
-- receive, which lives in routes, not in who they are.
--
-- 0009 IS DELIBERATELY LEFT ALONE rather than rewritten. It has already been
-- applied - to local D1 here, and possibly to any other machine that pulled
-- main - and `d1 migrations apply` tracks by filename, not content. Editing an
-- applied migration in place makes two databases silently disagree about what
-- their own schema is, which is close to undebuggable. Migrations here are
-- append-only. Correcting a decision costs one more file; pretending the old
-- decision never happened costs a weekend.
--
-- An individual courier gets NO Organization row. Someone delivering on their
-- own bike is a plain User with accountType COURIER, so every courier flow has
-- to work for a bare user as well as an org member. That is the price of not
-- inventing a one-person "organization" per rider, which the payout and
-- approval flows would then have to keep pretending was a business.
--
-- Renames rather than create-copy-drop: SQLite rewrites foreign-key references
-- in other tables as part of ALTER TABLE ... RENAME TO, so no data moves and
-- nothing has to be re-pointed by hand. Indexes follow the renamed table but
-- keep their old names, so they are dropped and recreated with the names
-- `prisma migrate diff` produces - otherwise the next person to diff the schema
-- gets a spurious mismatch.
--
-- kind DEFAULTS 'STORE', which is correct rather than merely convenient: every
-- row that exists at this point was created as a store.

ALTER TABLE "Store" RENAME TO "Organization";
ALTER TABLE "StoreMember" RENAME TO "OrganizationMember";
ALTER TABLE "OrganizationMember" RENAME COLUMN "storeId" TO "organizationId";
ALTER TABLE "Organization" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'STORE';

DROP INDEX IF EXISTS "Store_slug_key";
DROP INDEX IF EXISTS "StoreMember_userId_idx";
DROP INDEX IF EXISTS "StoreMember_storeId_userId_key";

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_kind_status_idx" ON "Organization"("kind", "status");
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
