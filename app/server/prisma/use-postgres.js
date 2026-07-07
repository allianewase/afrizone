#!/usr/bin/env node
// Switches schema.prisma from SQLite to PostgreSQL provider.
// Run: node prisma/use-postgres.js
// Then: prisma generate && prisma migrate deploy
const fs = require('fs');
const p = require('path');

const schemaPath = p.join(__dirname, 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

if (schema.includes('provider = "postgresql"')) {
  console.log('schema.prisma already uses postgresql. Nothing to do.');
  process.exit(0);
}

schema = schema.replace('provider = "sqlite"', 'provider = "postgresql"');
fs.writeFileSync(schemaPath, schema);
console.log('schema.prisma updated: provider = "postgresql"');
console.log('Next steps:');
console.log('  1. Set DATABASE_URL to your Postgres connection string in .env');
console.log('  2. npx prisma generate');
console.log('  3. npx prisma migrate deploy   (or: prisma db push for a fresh DB)');
