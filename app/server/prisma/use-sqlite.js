#!/usr/bin/env node
// Reverts schema.prisma back to SQLite provider (for local development).
// Run: node prisma/use-sqlite.js
const fs = require('fs');
const p = require('path');

const schemaPath = p.join(__dirname, 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

if (schema.includes('provider = "sqlite"')) {
  console.log('schema.prisma already uses sqlite. Nothing to do.');
  process.exit(0);
}

schema = schema.replace('provider = "postgresql"', 'provider = "sqlite"');
fs.writeFileSync(schemaPath, schema);
console.log('schema.prisma updated: provider = "sqlite"');
console.log('Next steps:');
console.log('  1. Set DATABASE_URL=file:./dev.db in .env');
console.log('  2. npx prisma generate && npx prisma db push');
