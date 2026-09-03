#!/usr/bin/env node
/**
 * Print the SQL that gives somebody an Afrizone staff account.
 *
 * WHY A SCRIPT AND NOT AN ENDPOINT. There is deliberately no API that mints an
 * admin: an endpoint that can create a SUPER_ADMIN is the single most valuable
 * thing on the platform to find a hole in, and it would exist to be used a
 * handful of times a year. The cost of that trade is this file — and having it
 * written down beats somebody hand-typing an INSERT at midnight and guessing at
 * which columns are NOT NULL.
 *
 * IT PRINTS SQL, IT DOES NOT RUN IT. You read what it will do, then run it
 * yourself against the database you meant. A script that writes to production
 * on argv alone is one typo away from doing it to the wrong one.
 *
 *   node scripts/add-admin.mjs "Ada Lovelace" ada@example.com TASK_MANAGER > add-admin.sql
 *   npx wrangler d1 execute afrizone-db --remote --file add-admin.sql
 *
 * SIGN-IN IS GOOGLE, AND THE ROW CARRIES NO PASSWORD. `POST /api/auth/google`
 * with the admin context is invite-only: it refuses anybody who is not already
 * an admin row, matches on the verified Google email, and links the googleId on
 * first sign-in. So creating the row IS the invitation — they click "Sign in
 * with Google" and they are in. Nothing has to be sent to them, which matters
 * here because SMTP is unconfigured: a password account would need its reset
 * token read out of `wrangler tail`, and a password sent over chat is a
 * credential you can never un-send.
 *
 * PICK THE SMALLEST ROLE THAT WORKS:
 *   TASK_MANAGER  tasks, applications, deliveries, the Mart board, stores.
 *                 Covers 27 of the guarded routes. The right default.
 *   HR_ADMIN      workers, KYC review, credentials.
 *   SUPER_ADMIN   all of the above plus money and platform configuration —
 *                 releasing payments, funding, wallets, tax rates, categories,
 *                 skills, credential types. 19 routes are this role alone.
 *                 Give it when somebody needs it, not when they ask nicely.
 */

const ROLES = ['SUPER_ADMIN', 'TASK_MANAGER', 'HR_ADMIN']

const [name, email, role = 'TASK_MANAGER'] = process.argv.slice(2)

if (!name || !email) {
  console.error('usage: node scripts/add-admin.mjs "Full Name" email@example.com [ROLE]')
  console.error(`       ROLE is one of ${ROLES.join(' | ')} (default TASK_MANAGER)`)
  process.exit(1)
}
if (!ROLES.includes(role)) {
  console.error(`error: role must be one of ${ROLES.join(', ')}`)
  process.exit(1)
}
if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error('error: that does not look like an email address')
  process.exit(1)
}

// The Google account's address, lower-cased, because that is what the server
// looks the row up by after verifying the token.
const addr = email.trim().toLowerCase()
const q = (v) => `'${String(v).replace(/'/g, "''")}'`

// cuid-shaped enough to sit beside the rest without pretending to be one, and
// obvious in a table listing about who created it.
const id = `staff_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const now = new Date().toISOString().replace('Z', '+00:00')

process.stdout.write(`-- Afrizone staff account for ${addr} (${role})
-- Generated ${now} by scripts/add-admin.mjs
--
-- They sign in at the admin console with "Sign in with Google", using this
-- exact address. No password is set and none is needed; the googleId links
-- itself on their first sign-in.
--
-- To check it afterwards:
--   SELECT email, role, googleId IS NOT NULL AS linked FROM "User" WHERE email = ${q(addr)};
--
-- To take the access away again:
--   UPDATE "User" SET role = 'WORKER' WHERE email = ${q(addr)};
-- Demote rather than delete: audit rows point at the user id, and at least one
-- SUPER_ADMIN must always remain or Mart-generated task creation fails with
-- NO_CREATOR and silently stops creating anything.

INSERT INTO "User" (id, name, email, passwordHash, role, accountType, tiers, kycStatus, createdAt)
VALUES (${q(id)}, ${q(name)}, ${q(addr)}, NULL, ${q(role)}, 'INDIVIDUAL', '', 'VERIFIED', ${q(now)});

SELECT email, name, role FROM "User" WHERE email = ${q(addr)};
`)
