/**
 * Turns prisma/reference.ts into SQL that is safe to run against production.
 *
 * WHY A FILE RATHER THAN A SCRIPT THAT WRITES TO THE DATABASE. Anything pointed
 * at production should be readable before it runs, by a person, in full. A
 * generated .sql file can be reviewed in a diff, applied with
 * `wrangler d1 execute --remote --file`, and shown to somebody afterwards as
 * exactly what happened. A program that connects and does things cannot.
 *
 * TWO RULES, AND BOTH MATTER MORE THAN THE CONTENT:
 *
 *   NOTHING IS EVER DELETED. `prisma/seed.ts` opens by emptying every table -
 *   correct for a development database, catastrophic for one with real users
 *   in it. Nothing here emits DELETE, DROP or TRUNCATE, and the generator
 *   refuses to write a file that does (see the check at the bottom), rather
 *   than trusting that nobody ever adds a clever statement above.
 *
 *   NOTHING EXISTING IS EVER MODIFIED. Every statement is insert-if-absent.
 *   If an admin has renamed a skill, retired a credential type or changed a
 *   tax rate, re-running this must not quietly undo their work. The cost of
 *   that rule is that a corrected name here will not reach a row that already
 *   exists - which is the right trade: a stale label is a nuisance, an
 *   overwritten policy decision is an incident.
 *
 * IDS ARE DETERMINISTIC (`ref_skill_photography`) rather than random. Re-running
 * produces the same ids, a foreign key written against one stays valid, and
 * anybody reading the table can tell a seeded row from one an admin created.
 */
import fs from "fs";
import path from "path";
import { CATEGORIES, CREDENTIAL_TYPES, SKILLS, TAX_RATES } from "../prisma/reference";

/** Single-quote escaping, which is all SQLite needs for a string literal. */
function q(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function bool(value: boolean): string {
  return value ? "1" : "0";
}

const lines: string[] = [];

function section(title: string, body: string[]) {
  lines.push("");
  lines.push(`-- ${"-".repeat(72)}`);
  lines.push(`-- ${title}`);
  lines.push(`-- ${"-".repeat(72)}`);
  lines.push(...body);
}

lines.push("-- Afrizone reference data.");
lines.push("--");
lines.push("-- GENERATED FILE - do not edit. Change prisma/reference.ts and run");
lines.push("--   npm run reference:sql");
lines.push("--");
lines.push("-- Safe to run against production, and safe to run twice. Every statement");
lines.push("-- inserts only when the row is absent: nothing is deleted, and nothing that");
lines.push("-- already exists is modified. An admin who has renamed a skill or retired a");
lines.push("-- credential type keeps their change.");
lines.push("--");
lines.push("-- Apply with:");
lines.push("--   npx wrangler d1 execute afrizone-db --remote --file=scripts/reference-data.sql");

// Categories and tax rates have no unique constraint to conflict on, so absence
// is tested explicitly. The alternative - adding unique indexes to production
// tables just so this file can use ON CONFLICT - is a schema change driven by a
// script, which is the wrong way round.
section(
  "Task categories (keyed on name)",
  CATEGORIES.map(
    (c) =>
      `INSERT INTO "Category" ("id", "name", "tier", "defaultPayModel", "active")\n` +
      `SELECT ${q(`ref_cat_${c.name.toLowerCase().replace(/\s+/g, "-")}`)}, ${q(c.name)}, ${q(c.tier)}, ${q(c.defaultPayModel)}, 1\n` +
      `WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = ${q(c.name)});`
  )
);

section(
  "Tax rates (keyed on jurisdiction + category)",
  TAX_RATES.map(
    (t) =>
      `INSERT INTO "TaxRate" ("id", "jurisdiction", "category", "whtRate", "vatRate", "active")\n` +
      `SELECT ${q(`ref_tax_${t.jurisdiction.toLowerCase()}_${t.category.toLowerCase()}`)}, ${q(t.jurisdiction)}, ${q(t.category)}, ${t.whtRate}, ${t.vatRate}, 1\n` +
      `WHERE NOT EXISTS (SELECT 1 FROM "TaxRate" WHERE "jurisdiction" = ${q(t.jurisdiction)} AND "category" = ${q(t.category)});`
  )
);

section(
  "Skills (self-declared, gate nothing)",
  SKILLS.map(
    (s) =>
      `INSERT INTO "Skill" ("id", "name", "slug", "group", "active", "sortOrder", "createdAt")\n` +
      `VALUES (${q(`ref_skill_${s.slug}`)}, ${q(s.name)}, ${q(s.slug)}, ${q(s.group)}, 1, ${s.sortOrder}, CURRENT_TIMESTAMP)\n` +
      `ON CONFLICT ("slug") DO NOTHING;`
  )
);

section(
  "Credential types (checked by a person, and these DO gate work)",
  CREDENTIAL_TYPES.map(
    (c) =>
      `INSERT INTO "CredentialType" ("id", "name", "slug", "reviewMode", "issuerMode", "requiresExpiry", "requiresReference", "requiresFile", "issuerHint", "active", "sortOrder", "createdAt")\n` +
      `VALUES (${q(`ref_cred_${c.slug}`)}, ${q(c.name)}, ${q(c.slug)}, ${q(c.reviewMode)}, ${q(c.issuerMode)}, ${bool(c.requiresExpiry)}, ${bool(c.requiresReference)}, ${bool(c.requiresFile)}, ${c.issuerHint ? q(c.issuerHint) : "NULL"}, 1, ${c.sortOrder}, CURRENT_TIMESTAMP)\n` +
      `ON CONFLICT ("slug") DO NOTHING;`
  )
);

const sql = lines.join("\n") + "\n";

// Belt and braces: the file this generator writes is going to be pointed at a
// database with real people in it, so it checks its own output rather than
// trusting that nobody ever adds a clever statement above.
const forbidden = /\b(DELETE|DROP|TRUNCATE|UPDATE|ALTER)\b/i;
for (const line of sql.split("\n")) {
  if (line.trim().startsWith("--")) continue;
  if (forbidden.test(line)) {
    throw new Error(`Refusing to emit a destructive statement: ${line.trim()}`);
  }
}

// Written here rather than piped through the shell. The runner prints its own
// banner to stdout, and a redirect puts that line at the top of the .sql file -
// where it is a syntax error the moment anybody applies it. Found exactly that
// way, one step before production.
const out = path.join(__dirname, "reference-data.sql");
fs.writeFileSync(out, sql, "utf8");
console.log(
  `Wrote ${out}: ${CATEGORIES.length} categories, ${TAX_RATES.length} tax rates, ` +
    `${SKILLS.length} skills, ${CREDENTIAL_TYPES.length} credential types.`
);
