import { prisma } from "../src/prisma";
import { signToken } from "../src/auth";
import { Role } from "../src/types";

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
  const user = await prisma.user.create({
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
  const token = signToken({ sub: user.id, role: user.role as Role, email: user.email });
  return { user, token };
}

export { prisma };
