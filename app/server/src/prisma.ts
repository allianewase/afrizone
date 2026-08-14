import { env } from "cloudflare:workers";
import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

// `env` (from `cloudflare:workers`) only exists once the Workers runtime is
// actually running - whether that's guaranteed at pure module-evaluation
// time (isolate boot, before any request) or only once a request is being
// handled isn't something to gamble on across ~20 importing files. A Proxy
// sidesteps the question entirely: `realPrisma()` only actually runs on the
// first real property access (`prisma.task`, `prisma.$transaction`, ...),
// which only ever happens from inside a route handler, i.e. while a request
// is being handled - so env.DB is guaranteed ready by construction, not by
// assumption. This also means every existing `import { prisma } from
// "../prisma"` call site keeps working completely unchanged.
let _prisma: PrismaClient | undefined;
function realPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) });
  }
  return _prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return Reflect.get(realPrisma(), prop);
  },
});
