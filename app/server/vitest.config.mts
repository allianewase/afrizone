import path from "node:path";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

export default defineConfig(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Test-only overrides layered on top of wrangler.jsonc's bindings -
          // does not touch the real dev/production secrets (never committed).
          bindings: {
            TEST_MIGRATIONS: migrations,
            JWT_SECRET: "test-secret-for-automated-tests-only",
            NODE_ENV: "test",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      // Test files each spin up their own Miniflare D1 emulation instance;
      // running them concurrently caused intermittent hangs/timeouts even
      // after fixing the leaked-PrismaClient issue below (reproduced
      // directly - disappeared once serialized). This suite is small (a few
      // dozen tests), so serial file execution costs a few seconds and buys
      // reliability.
      fileParallelism: false,
    },
  };
});
