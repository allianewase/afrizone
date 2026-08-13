/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  globalSetup: "<rootDir>/test/globalSetup.ts",
  setupFiles: ["<rootDir>/test/env.ts"],
  testTimeout: 15000,
  // All test files share one SQLite file (test.db) through a single Prisma
  // connection pattern: running them in parallel workers risks SQLITE_BUSY.
  maxWorkers: 1,
};
