// Deliberately does NOT import src/prisma.ts or src/auth.ts: those pull in
// `cloudflare:workers`, whose `env` is scoped to the SELF worker under test,
// not this test module. Constructing a separate PrismaClient here against
// `cloudflare:test`'s `env.DB` talks to the exact same underlying D1 storage
// for this test file (per vitest-pool-workers' isolated-per-file storage).
//
// Must be disconnected once a file's tests finish (see the afterAll in
// test/apply-migrations.ts) - the underlying Workers-pool process is reused
// across test files, not recreated per file, so a leaked client here caused
// unrelated, otherwise-trivial queries in later files to hang indefinitely.
import { env } from "cloudflare:test";
import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import jwt from "jsonwebtoken";
import { Role } from "../src/types";

// Must match vitest.config.mts's miniflare.bindings.JWT_SECRET.
const TEST_JWT_SECRET = "test-secret-for-automated-tests-only";

let _prisma: PrismaClient | undefined;
export function testPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) });
  }
  return _prisma;
}

let counter = 0;
function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@afrizone.work`;
}

// Creates a user directly via Prisma (bypassing the public API, which can
// only self-serve WORKER accounts) and returns a ready-to-use auth token.
export async function createUserWithToken(
  role: Role,
  overrides: Partial<{ name: string; email: string; kycStatus: string; bankMasked: string }> = {}
) {
  const user = await testPrisma().user.create({
    data: {
      name: overrides.name || `Test ${role}`,
      email: overrides.email || uniqueEmail(role.toLowerCase()),
      passwordHash: null,
      role,
      tiers: "",
      kycStatus: overrides.kycStatus || "PENDING",
      bankMasked: overrides.bankMasked,
    },
  });
  const token = jwt.sign({ sub: user.id, role: user.role, email: user.email }, TEST_JWT_SECRET, {
    expiresIn: "7d",
  });
  return { user, token };
}
