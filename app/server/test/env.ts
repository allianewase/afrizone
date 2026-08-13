// Jest setupFiles: runs before the test framework loads and before any
// application code is imported, so these must win over `dotenv/config`
// (which only fills in vars that aren't already set).
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";
process.env.JWT_SECRET = "test-secret-for-automated-tests-only";
