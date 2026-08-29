# AfriZone Part-Time — architecture

Written for three jobs: **reporting** on the system, **auditing** it, and **changing
it safely**. Section 12 is the one that matters most for the third — it lists the
decisions that look like mistakes and explains why they are not, so nobody "fixes"
one back into a bug.

Accurate as of migration `0011`. When something here stops matching the code, the
code is right and this file is stale — say so in the PR that made it stale.

---

## 1. What this is

AfriZone Part-Time is the **operational workforce platform** in the AfriZone
ecosystem. It is not a shop.

| System | Owns |
|---|---|
| **AfriZoneMart** | Customers, products, stock, orders, money taken from customers |
| **AfriZone Part-Time** | The people and businesses who *execute* that work, and what they are owed |

Three kinds of outside party use it: **individuals** who take tasks, **stores** that
fulfil Mart orders, and **couriers** who deliver them. Afrizone staff administer all
of it from a separate admin web app.

The boundary with Mart is specified in `MART_INTEGRATION.md` and is **not built yet**.

---

## 2. The three applications

| App | Path | Stack | Size | Runs on |
|---|---|---|---|---|
| **API** | `app/server` | Express on Cloudflare Workers, Prisma + D1 (SQLite), R2 | ~8,100 lines | `wrangler dev --port 4000` |
| **Admin web** | `app/web-admin` | Vite + React + TypeScript, shadcn/Radix | ~24,200 lines | `npm run dev` → :5173 |
| **Worker mobile** | `app/mobile` | Expo SDK 51 + expo-router | ~13,700 lines | `npx expo start` |

The admin web proxies `/api` → `:4000` in dev. The mobile app reads
`EXPO_PUBLIC_API_URL`.

**Why Workers and D1**: the whole API is one Worker with a D1 binding and an R2
bucket, deployed by `wrangler deploy`. There is no server to keep alive and no
connection pool to exhaust. The cost is that a few Node assumptions do not hold —
see §12.

---

## 3. Data model

**30 tables.** Prisma owns the schema; SQLite stores every enum as a string (§12).

### Identity and access
| Model | Purpose |
|---|---|
| `User` | Everyone: Afrizone staff, workers, store staff, couriers |
| `OtpCode` | Phone-login codes, hashed with a per-row salt and a pepper |
| `PasswordReset` | Admin password-reset tokens |
| `AuditLog` | Who did what. Actor may be a person **or** a system/webhook/integration |

### Businesses
| Model | Purpose |
|---|---|
| `Organization` | A store **or** a courier company, discriminated by `kind` |
| `OrganizationMember` | Which people may act for which business, with `OWNER`/`STAFF` standing |

### Work
| Model | Purpose |
|---|---|
| `Task` | A unit of work. Deliveries will also be Tasks |
| `Application` | A worker applying; carries the frozen `eligibilitySnapshot` |
| `Contract` | Per-task agreement, typed-name e-signature with a SHA-256 tamper hash |
| `ClockEvent` | Clock in/out with geofence data |
| `Timesheet` | Hours submitted for approval |
| `Rating` | Worker rating after a task |
| `Dispute` | Raised against a timesheet or payment |

### Talent and eligibility
| Model | Purpose |
|---|---|
| `Skill`, `WorkerSkill` | Self-declared. Gate nothing on their own (§12) |
| `CredentialType`, `Credential` | Checked by a person. These *do* gate work |
| `TaskSkillRequirement`, `TaskCredentialRequirement` | What a task demands |

### Money
| Model | Purpose |
|---|---|
| `Payment` | Gross, WHT rate, WHT amount, net — per worker per task |
| `Withdrawal` | Payout request; Paystack transfer or simulated |
| `Funding` | Inbound platform top-up via Paystack checkout |
| `TaxRate` | WHT/VAT by jurisdiction and category |

### KYC
`KycDocument` (R2-backed), `KycVerification` (Smile Identity results).

### Platform
`Notification` (durable inbox), `Setting` (key/value, incl. the eligibility
kill-switch), `Category`, `Job` + `JobApplication` (the internal hiring module —
live, used for regional managers and marketing, unrelated to the three account
types).

---

## 4. Authorization — the audit section

**Three independent axes.** Confusing them is the most likely way to introduce a
hole.

| Axis | Field | Answers | Values |
|---|---|---|---|
| **Staff role** | `User.role` | Are you Afrizone staff, and which kind? | `SUPER_ADMIN`, `TASK_MANAGER`, `HR_ADMIN`, `WORKER` |
| **Account type** | `User.accountType` | What kind of outside party are you? | `INDIVIDUAL`, `STORE`, `COURIER` |
| **Membership** | `OrganizationMember` | May you act for *this specific* business? | `OWNER`, `STAFF` |

### The five guards

| Guard | Where | Enforces |
|---|---|---|
| `requireAuth` | `src/auth.ts` | A valid session token. Rejects 2FA challenge tokens and any payload without a real role |
| `requireRole(...)` | `src/auth.ts` | Staff role. Used in 17 route files |
| `requireAccountType(...)` | `src/auth.ts` | Account type. Reads the **database**, not the token |
| `requireAssignedTask()` | `src/util/assignment.ts` | This worker was actually approved for this task |
| `requireOrgAccess()` | `src/util/organization.ts` | This person belongs to this organization, optionally with a role/status/kind |

**The role check is the easy half.** "Is this a store account?" is answered
identically by every store account — it cannot separate one store from another.
Row-level ownership (`requireOrgAccess`, `requireAssignedTask`) is what actually
protects data, and it is called **per handler**, not as router middleware, because
some routes on the same router must stay open (e.g. `GET /api/tasks` is the mobile
feed).

### Two rules an auditor should check

1. **A non-member gets `404`, never `403`.** 403 confirms a record exists, which
   turns any id-taking endpoint into a directory for anyone willing to enumerate.
2. **Developer bypasses fail closed.** `src/env.ts` requires an explicit
   `NODE_ENV=development|test`. This was previously written as
   `NODE_ENV !== "production"`, and because Workers never set `NODE_ENV`, every
   bypass — a master OTP, a password-reset token in the response body, a fixed TOTP
   code — was **live in production**. Inverting the test removed the whole class.

### Live self-check

`GET /api/health/config` reports which integrations are real vs simulated and flags
an insecure `JWT_SECRET` or a missing R2 binding. **That is the first thing to run
in an audit.**

---

## 5. Money

### Today: paying workers

```
Timesheet approved → Payment (gross, whtRate, whtAmount, net)
                   → released → worker wallet
                   → Withdrawal → Paystack transfer → webhook → PAID
```

- **Whole-Naira integers everywhere.** No floats, no kobo.
- **WHT default 5%, deducted at source.** `net` is derived by subtraction, never
  rounded independently — see §12.
- **Wallet is derived, not stored**: `available = released earnings − non-failed
  withdrawals`.
- With no `PAYSTACK_SECRET`, withdrawals run in **simulated mode** and stay
  `PROCESSING`. The dev settle endpoint is disabled in production, so in that
  configuration a withdrawal can never complete.

### Planned: paying businesses

**Not built.** Decided design: Part-Time **computes what is owed and reports it;
Mart pays it.** No funds move through Part-Time. Store revenue must not go through
the `Payment`/WHT path — that path is shaped for wages, and withholding 5% from a
store's goods revenue would be wrong. See `MART_INTEGRATION.md` §7.

---

## 6. The eligibility gate

`src/services/eligibility.ts` answers one question — *can this worker take this
task?* — and **every caller runs the same function**: the apply endpoint, the
approval re-check, the task feed, and the admin's live qualifying-count.

- `decide()` is **pure**: no queries, no clock. Loading is separate, so one worker
  against forty tasks costs the same three profile queries as one task.
- Returns **every** unmet reason at once, each with worker-facing wording and a
  route to fix it. Fixing one thing at a time to discover the next is how people
  give up.
- **Enforced by default**, switchable off without a deploy via the `Setting` key
  `eligibility.enforce` (Admin → Settings → Requirements). **Tier always enforces**,
  switch or no switch — it predates this feature.
- Approval **re-checks**, because a licence can lapse between applying and being
  approved. An admin may override explicitly; the override is audited.

---

## 7. Integrations

| Service | Purpose | Unconfigured behaviour |
|---|---|---|
| **Paystack** | Payouts and inbound funding | Simulated; no real money moves |
| **Smile Identity** | Automated KYC document checks | Falls back to manual admin review |
| **Termii** | SMS one-time codes | Disabled; dev code path only |
| **Google** | Admin SSO and worker sign-in | Endpoint returns 503 |
| **Expo Push** | Mobile notifications | Inbox still written; push skipped |
| **Cloudflare R2** | KYC document storage | Binding required — no fallback |
| **SMTP** | Email | **Not configured.** Password-reset tokens are logged, not sent |

Two inbound webhooks exist, both signature-verified with the raw request body:
`POST /api/webhooks/paystack` and `POST /api/webhooks/smile`.

---

## 8. Configuration

| Kind | Where | Examples |
|---|---|---|
| Plain vars | `wrangler.jsonc` → `vars` | `NODE_ENV`, `CORS_ORIGIN`, `WEB_ADMIN_URL`, Google client ids, `SMS_PROVIDER`, `TERMII_FROM` |
| Secrets | Cloudflare dashboard / `wrangler secret put` | `JWT_SECRET`, `TERMII_API_KEY`, `PAYSTACK_SECRET` |
| Local dev | `app/server/.env` (gitignored) | Overrides for local runs |

**A var edited in the Cloudflare dashboard is reverted by the next `wrangler
deploy`** — the config file wins. Change plain vars in `wrangler.jsonc`. Secrets are
never touched by a deploy.

There is **no `ADMIN_EMAIL` or `ADMIN_PASSWORD`**. The admin login is a seeded `User`
row; rotating it is a database update, not a config change.

---

## 9. Migrations

Hand-written SQL under `app/server/migrations/`, applied with
`wrangler d1 migrations apply`. Prisma Migrate does not support D1.

**Two rules, both learned the hard way:**

1. **Append-only.** Never edit an applied migration. `d1 migrations apply` tracks by
   *filename*, so editing one makes two databases silently disagree about their own
   schema. `0011` reverses a decision from `0009` by adding a file, not by rewriting
   one.
2. **Migration before code.** Apply to production *before* deploying code that reads
   it. Every migration since `0002` has followed this.

| # | What |
|---|---|
| 0001 | Initial schema |
| 0002–0004 | Dispute prior-status, nullable audit actor, OTP salt |
| 0005 | Indexes on six tables that had none |
| 0006 | Notification inbox |
| 0007 | Talent profile — skills and credentials |
| 0008 | Task requirements |
| 0009 | Stores *(superseded by 0011)* |
| 0010 | `User.accountType` |
| 0011 | Store → `Organization { kind }` |

> **Outstanding: 0008–0011 have not been applied to production.** Everything built
> on them is inert until they are.

---

## 10. Testing

**236 tests across 23 files**, run with `vitest` under `vitest-pool-workers` — tests
execute inside a real Workers runtime against real D1, dispatched through the actual
exported handler rather than an imported Express app.

Coverage concentrates on the things that would be expensive to get wrong: the
assignment gate, KYC upload guards and file authorization, withdrawal idempotency,
tax arithmetic, the eligibility engine, organization ownership, and dev-gate
inversion.

**Two harness constraints worth knowing:**
- The test database is built **from migrations only** — the seed never runs, so seed
  content cannot be asserted in the suite. Verify that against a running server.
- Default per-test timeout is 5s, and a loaded full run occasionally trips it. An
  unexplained single-test failure has recurred a few times and has **not** been
  diagnosed.

---

## 11. Deployment

CI (`.github/workflows/ci.yml`) runs on every push to `main`: `prisma generate`,
`tsc --noEmit`, and the full test suite for the server; a production build for the
admin web; a typecheck for mobile.

**Order of operations for a release:**
1. Apply outstanding migrations to production D1.
2. `wrangler deploy` the API.
3. Build and publish the admin web.
4. Build and distribute the mobile app if it changed.

---

## 12. Decisions that look wrong and are not

**Read this before "fixing" anything below.**

**Credential expiry is derived, never stored.** There is no `EXPIRED` status.
`isCredentialValid()` computes it against the clock at read time. Stored, it would
depend on a scheduled job, whose failure mode is a lapsed licence still reading as
valid. The same rule governs an expired posting — see `isTaskExpired()`.

*There is exactly one cron in this codebase, and the exception proves the rule.*
It deletes delivery customer data seven days after an order finishes
(`MART_INTEGRATION.md` §5, `services/deliveryPurge.ts`), because absence of data
is the one thing that cannot be derived at read time: a customer's address is not
deleted by nobody looking at it. It is written so that missing a run is safe — it
works from a cutoff rather than from "since last time" — and it writes an audit
row on every run including one that finds nothing, so a job that silently stopped
firing is distinguishable from a quiet week. Anything else that wants to be a
scheduled job should be derived instead.

**Skills carry no verification state.** No `verified` column on `WorkerSkill`. Skills
are the worker's own word and unlock nothing; anything that must be guaranteed is a
`CredentialType`. A "checked by us" badge on a skill would be a promise the
eligibility engine breaks.

**`User.accountType` is NOT NULL defaulting `INDIVIDUAL`, so admin rows carry a value
that is untrue of them.** Nothing reads it on admin routes — those gate on `role` —
and the alternative costs NULL handling at every read plus a window where accounts
created between the migration and the code have no type at all.

**Organization routes do not use `requireAccountType`.** Membership is the authority.
Every STORE account answers "are you a store?" identically, so the check buys nothing
and would break an individual worker who also helps at the family shop.

**A non-member gets 404, not 403.** See §4.

**`Task.requirementsSummary` is denormalised and decides nothing.** A stale string on
a card is harmless; a stale string that refuses an application is a wrong refusal
nobody authorised.

**The notification inbox write is awaited; the push is best-effort.** Push silently
fails — no token, revoked permission, Expo down — so the durable record must land
first. `DeviceNotRegistered` tickets null the stored token.

**`net` is derived by subtraction, not rounded independently.** Rounding both halves
separately broke reconciliation for 5% of amounts: when `gross × rate` landed on
`.5`, both rounded up and `whtAmount + net` came to `gross + 1`. Subtraction makes
the invariant hold by construction.

**Enums are strings, and `User.tiers` is a comma-separated string.** SQLite has no
enum and no scalar list. Helpers convert at the boundary.

**Guards are per-handler, not router-level.** Mounting one on the tasks router would
catch `GET /` and `GET /:id`, which are the mobile app's feed and must stay open.

**`homeRouteFor()` sends COURIER to the worker dashboard.** One function, one branch
— that is the single line to change if couriers get their own interface. Deliberate,
so the decision stays cheap.

**Env gates require an explicit `development` or `test`.** See §4.

---

## 13. Known gaps

**Not built at all**
- Orders, and the entire AfriZoneMart integration (specified in `MART_INTEGRATION.md`)
- Delivery: assignment, pickup/drop-off, OTP, the standing courier agreement
- Store/organization settlement
- Product sourcing (parked — the money flow is an open product decision)

**Built but incomplete**
- The admin Organizations page can view members but cannot add or remove them; only
  the first owner can be seeded, at creation
- `Contract` is 1:1 with `Task`, which will not hold for a standing courier agreement
- No scheduler exists; the retainer and the customer-data purge will both need one

**Configuration**
- `PAYSTACK_SECRET` unset → payouts simulated, withdrawals cannot complete in production
- `SMTP_URL` unset → password-reset tokens are logged, never emailed
- Smile Identity unset → all KYC is manual
- Migrations 0008–0011 not applied to production

**Unresolved**
- The intermittent single-test failure in full suite runs (§10)
