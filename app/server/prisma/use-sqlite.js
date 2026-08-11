#!/usr/bin/env node
// Reverts schema.prisma back to SQLite provider (for local development).
// Run: node prisma/use-sqlite.js
const fs = require('fs');
const p = require('path');

const schemaPath = p.join(__dirname, 'schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');

// See use-postgres.js for why this is anchored to start-of-line rather than
// a bare string/regex search: the instructional comment above the real
// datasource block also contains example provider strings.
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

if (providerMatch[1] === 'sqlite') {
  console.log('schema.prisma already uses sqlite. Nothing to do.');
  process.exit(0);
}

const newBlock = block.replace(/provider\s*=\s*"(sqlite|postgresql)"/, 'provider = "sqlite"');
fs.writeFileSync(schemaPath, schema.replace(block, newBlock));
console.log('schema.prisma updated: provider = "sqlite"');
console.log('Next steps:');
console.log('  1. Set DATABASE_URL=file:./dev.db in .env');
console.log('  2. npx prisma generate && npx prisma db push');
