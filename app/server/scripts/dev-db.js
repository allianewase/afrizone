#!/usr/bin/env node
// Boots a persistent local Postgres instance (no Docker/admin rights needed)
// for "production mode" (see prisma/use-postgres.js). Data lives in
// server/.pgdata (gitignored) and survives restarts. Matches the
// DATABASE_URL in .env.example: postgresql://afrizone:afrizone@localhost:5432/afrizone
const path = require('path');
// embedded-postgres is ESM-only; require() from this CJS script surfaces the
// default export under `.default` rather than as module.exports directly.
const EmbeddedPostgres = require('embedded-postgres').default;

const dataDir = path.join(__dirname, '..', '.pgdata');

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'afrizone',
  password: 'afrizone',
  port: 5432,
  persistent: true,
});

async function main() {
  const fs = require('fs');
  const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));

  // initialise() runs initdb, which refuses to run against a non-empty data
  // directory — only call it the first time the cluster is created.
  if (firstRun) {
    await pg.initialise();
  }
  await pg.start();
  console.log('Postgres running on localhost:5432 (data: server/.pgdata)');

  if (firstRun) {
    // template1 defaults to a non-UTF8 encoding on Windows, which breaks
    // inserting non-ASCII text (₦, etc.) — recreate the db explicitly.
    const client = pg.getPgClient();
    await client.connect();
    await client.query('DROP DATABASE IF EXISTS afrizone');
    await client.query("CREATE DATABASE afrizone ENCODING 'UTF8' TEMPLATE template0");
    await client.end();
    console.log('Created "afrizone" database (UTF8).');
  }

  console.log('Press Ctrl+C to stop.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await pg.stop();
  process.exit(0);
});
