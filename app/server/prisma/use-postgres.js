#!/usr/bin/env node
// Switches schema.prisma from SQLite to PostgreSQL provider.
// Run: node prisma/use-postgres.js
// Then: prisma generate && prisma migrate deploy
const fs = require('fs');
const p = require('path');

const schemaPath = p.join(__dirname, 'schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');

// Anchored to start-of-line so this can only match the real, active
// `datasource db { ... }` block: the instructional comment above it is
// indented and prefixed with `//`, so it never starts a line with
// "datasource" and can't be mistaken for the real block.
const blockRegex = /^datasource\s+db\s*\{[^}]*\}/m;
const blockMatch = schema.match(blockRegex);
if (!blockMatch) {
  console.error('Could not find an active datasource db { ... } block in schema.prisma.');
  process.exit(1);
}
const block = blockMatch[0];

const providerMatch = block.match(/provider\s*=\s*"(sqlite|postgresql)"/);
if (!providerMatch) {
  console.error('Could not find a provider = "..." line inside the datasource block.');
  process.exit(1);
}

if (providerMatch[1] === 'postgresql') {
  console.log('schema.prisma already uses postgresql. Nothing to do.');
  process.exit(0);
}

const newBlock = block.replace(/provider\s*=\s*"(sqlite|postgresql)"/, 'provider = "postgresql"');
fs.writeFileSync(schemaPath, schema.replace(block, newBlock));
console.log('schema.prisma updated: provider = "postgresql"');
console.log('Next steps:');
console.log('  1. Set DATABASE_URL to your Postgres connection string in .env');
console.log('  2. npx prisma generate');
console.log('  3. npx prisma migrate deploy   (or: prisma db push for a fresh DB)');
