// Jest globalSetup — runs once before any test file. Provisions a fresh
// SQLite test database by pushing the current schema, matching the
// DATABASE_URL that test/env.ts sets for the actual test workers.
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

export default async function globalSetup() {
  const serverRoot = path.join(__dirname, "..");
  const dbFile = path.join(serverRoot, "prisma", "test.db");

  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbFile + suffix);
    } catch {
      // fine if it doesn't exist yet
    }
  }

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}
