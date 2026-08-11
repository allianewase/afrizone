# Afrizone Part Time: Backend

Node.js + TypeScript + Express + Prisma. Runs on **SQLite** out of the box (zero
external services), implementing the API in [`../API_CONTRACT.md`](../API_CONTRACT.md).

## Quick start (Windows / macOS / Linux)

```bash
cd app/server
npm install
npm run setup    # prisma generate + db push + seed
npm run dev      # starts http://localhost:4000
```

Health check: `GET http://localhost:4000/api/health`

### Admin login (seeded)
- **Email:** `admin@afrizone.work`
- **Password:** `afrizone123`
- Role: `SUPER_ADMIN`

Demo workers log in with `<firstname>.<lastname>@afrizone.work` / `worker123`
(e.g. `amaka.obi@afrizone.work`).

## Scripts
| Script | What it does |
|---|---|
| `npm run dev` | Run `src/index.ts` with live reload (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/index.js` |
| `npm run seed` | Seed admin + workers + tasks + applications + payments |
| `npm run prisma:push` | `prisma db push` (sync schema → DB) |
| `npm run setup` | `prisma generate` + `db push` + seed (one-shot) |

## Module system
CommonJS (`"type": "commonjs"`) + `module: "CommonJS"` in tsconfig. This is the
cleanest combination with `ts-node-dev` and Prisma: no ESM loader flags needed.

## Auth
JWT (`Authorization: Bearer <token>`), 7-day TTL. `POST /api/auth/login` returns
`{ token, user }`. Passwords are bcrypt-hashed.

## Switching to PostgreSQL (production)
The blueprint targets Postgres. To switch:
1. In `prisma/schema.prisma`, change the `datasource db` provider to `postgresql`
   (instructions are in a comment at the top of the file).
2. Set `DATABASE_URL` in `.env` to your Postgres connection string (see `.env.example`).
3. Optionally convert the String enum fields to real Prisma `enum`s and `tiers`
   to a `Tier[]` scalar list (both are Postgres-only: see next section).
4. Run `npm run setup` again.

## SQLite caveats (important for the schema)
SQLite supports **neither native enums nor scalar lists**, so:
- **Enums** (`Role`, `Tier`, `KycStatus`, `TaskStatus`, ...) are stored as `String`
  columns. Allowed values are TS union types in `src/types.ts` and are validated
  in route handlers. On Postgres these can become real `enum` blocks.
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
  .env / .env.example / .gitignore
  package.json / tsconfig.json / README.md
  prisma/
    schema.prisma   # models + SQLite/Postgres notes
    seed.ts         # admin + contract seed data
  src/
    index.ts        # Express app, CORS, routers, health, error handler
    prisma.ts       # PrismaClient singleton
    auth.ts         # login, JWT, requireAuth, requireRole
    types.ts        # enum unions + tiers <-> string helpers
    util/
      tax.ts        # computeWht
      audit.ts      # writeAudit
    routes/
      auth.ts dashboard.ts tasks.ts applications.ts
      timesheets.ts payments.ts workers.ts
```
