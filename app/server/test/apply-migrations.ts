// vitest-pool-workers setupFile: runs once per test file, inside the real
// Workers runtime, before that file's tests. Applies the same D1 migrations
// (migrations/) that production uses to this test run's isolated D1 storage -
// every test in the file then starts from that migrated-but-empty snapshot.
import { afterAll } from "vitest";
import { env, applyD1Migrations } from "cloudflare:test";
import { testPrisma } from "./helpers";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// The underlying Workers-pool process is reused across test FILES (only D1
// storage is isolated per file, not the process), and Jest's old suite
// always disconnected in an afterAll - dropped without noticing when porting
// to vitest. Without it, later files in a full run started hanging on
// otherwise-trivial queries; this closes each file's PrismaClient once its
// tests finish, matching the old behaviour.
afterAll(async () => {
  await testPrisma().$disconnect();
});
