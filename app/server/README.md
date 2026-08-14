# Afrizone Part Time: Backend

TypeScript + Express + Prisma, running on **Cloudflare Workers** with a **D1**
(SQLite-based) database and **R2** file storage, implementing the API in
[`../API_CONTRACT.md`](../API_CONTRACT.md). Local dev runs the same way via
`wrangler dev`, with D1/R2 emulated locally - no external services needed.

## Quick start (Windows / macOS / Linux)

```bash
cd app/server
npm install
npx prisma generate
npx wrangler d1 migrations apply afrizone-db --local
npm run seed     # demo data - also applies it to the local D1 emulation
npm run dev      # wrangler dev - starts a local Worker (see its output for the port)
```

Health check: `GET http://localhost:<port>/api/health`

### Admin login (seeded)
- **Email:** `admin@afrizone.work`
- **Password:** `afrizone123`
- Role: `SUPER_ADMIN`

Demo workers log in with `<firstname>.<lastname>@afrizone.work` / `worker123`
(e.g. `amaka.obi@afrizone.work`).

## Scripts
| Script | What it does |
|---|---|
| `npm run dev` | `wrangler dev` - local Worker with emulated D1/R2 |
| `npm run deploy` | `wrangler deploy` - what Workers Builds also runs on push to `main` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `vitest run` via `@cloudflare/vitest-pool-workers` - runs inside real `workerd`, real D1/R2 |
| `npm run seed` | Seed admin + workers + tasks + applications + payments (writes to `prisma/dev.db`, then dumps + applies the same data to `wrangler dev`'s local D1 emulation) |
| `npm run prisma:push` | `prisma db push` - local-dev-only convenience, not used against D1 (see below) |

## Module system
CommonJS (`"type": "commonjs"`) + `module: "CommonJS"` in tsconfig - unrelated to
the Workers runtime (which handles its own bundling via `wrangler`/esbuild);
kept for Prisma codegen and tooling compatibility.

## Auth
JWT (`Authorization: Bearer <token>`), 7-day TTL. `POST /api/auth/login` returns
`{ token, user }`. Passwords are bcrypt-hashed.

## Production: Cloudflare Workers + D1
Production runs on Cloudflare Workers with a D1 database (SQLite-based), via the
`@prisma/adapter-d1` driver adapter - see `src/prisma.ts`. The schema needs no
changes between local dev and D1: both are SQLite. Prisma Migrate does not
support D1 yet, so schema changes are applied via `prisma migrate diff` (generate
SQL) + `wrangler d1 migrations apply`, not `prisma migrate dev`/`db push` (that
pair stays the local-dev workflow, against `DATABASE_URL`).

## SQLite caveats (important for the schema)
SQLite (and D1, which is SQLite-based) supports **neither native enums nor
scalar lists**, so:
- **Enums** (`Role`, `Tier`, `KycStatus`, `TaskStatus`, ...) are stored as `String`
  columns. Allowed values are TS union types in `src/types.ts` and are validated
  in route handlers.
- **`tiers` (Tier[])** is stored as a **single comma-separated String** (e.g.
  `"PROMO,DISPATCH"`). The API **always exposes `tiers` as a real `string[]`**.
  Conversion helpers: `tiersToArray` / `tiersToString` in `src/types.ts`.

## Money & tax
All amounts are **whole-Naira integers**. WHT default 5% (`0.05`).
`net = round(gross − gross × whtRate)`: see `src/util/tax.ts`.
Approving a timesheet creates a `Payment` (status `APPROVED`) with computed
`gross / whtAmount / net`. Releasing a payment writes an `AuditLog`.

## Payments: Paystack payouts
Worker withdrawals (`POST /api/wallet/withdraw`) integrate **Paystack Transfers**,
driven by env (`src/services/paystack.ts`):

- **Simulated mode** (default: `PAYSTACK_SECRET` blank): no real money moves;
  withdrawals stay `PROCESSING`. Use `POST /api/wallet/dev/settle` to flip the
  caller's pending withdrawals to `PAID` and demo the full flow without webhooks.
- **Live mode** (set `PAYSTACK_SECRET=sk_test_…`): creates a transfer recipient
  (worker `bankAccountNumber` + `bankCode`) and initiates a transfer. Settlement
  is async: point the Paystack dashboard webhook at
  `POST /api/webhooks/paystack` (verified via `x-paystack-signature`,
  HMAC-SHA512); `transfer.success` → `PAID`, `transfer.failed/reversed` → `FAILED`.
  In dev, expose the webhook with a tunnel (e.g. ngrok).

`WithdrawalStatus` = `PROCESSING | PAID | FAILED`. Wallet `available` = released
earnings − non-failed withdrawals (consistent in `/me/wallet` and the admin
worker detail). No card data is ever stored (PCI handled by Paystack).

## Project layout
```
server/
  wrangler.jsonc              # Worker config: D1/R2 bindings, checked-in non-secret vars
  .env.example                # local wrangler-dev secret overrides (dev defaults, not sensitive)
  .env.production.example     # which secrets to `wrangler secret put` for production
  package.json / tsconfig.json / vitest.config.mts / README.md
  migrations/                 # D1 schema migrations (prisma migrate diff + wrangler d1 migrations apply)
  prisma/
    schema.prisma   # models + SQLite/D1 notes
    seed.ts         # admin + contract seed data
  src/
    index.ts        # Express app + Workers fetch handler, CORS, routers, health, error handler
    prisma.ts       # lazy PrismaClient Proxy (env.DB only exists inside a request)
    auth.ts         # login, JWT, requireAuth, requireRole
    types.ts        # enum unions + tiers <-> string helpers
    services/        # paystack, sms, google, smileIdentity, storage (R2), push, totp
    util/
      tax.ts        # computeWht
      audit.ts      # writeAudit
    routes/
      auth.ts dashboard.ts tasks.ts applications.ts
      timesheets.ts payments.ts workers.ts ...
  test/              # @cloudflare/vitest-pool-workers suite (runs inside real workerd)
```
