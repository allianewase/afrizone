# Afrizone Part Time: API Contract v1 (MVP slice)

Shared source of truth for the backend (`server/`) and admin frontend (`web-admin/`).
Backend runs on **http://localhost:4000**, all routes prefixed **`/api`**. Frontend dev server proxies `/api` → `:4000`.

Auth: `Authorization: Bearer <jwt>`. Money is in **kobo** is NOT used: all amounts are **whole Naira integers** (e.g. `18000` = ₦18,000). WHT default rate **5%** (`0.05`), configurable per task category later. `net = round(gross - gross*whtRate)`.

---

## Enums
- `Role`: `SUPER_ADMIN | TASK_MANAGER | HR_ADMIN | WORKER`
- `Tier`: `STUDENT | DISPATCH | REMOTE | PROMO | TRADE`
- `KycStatus`: `PENDING | VERIFIED | TIER_APPROVED | REJECTED`
- `PayModel`: `HOURLY | FIXED`
- `LocationType`: `PHYSICAL | REMOTE`
- `TaskStatus`: `OPEN | FILLED | CLOSED | ARCHIVED`
- `AppStatus`: `APPLIED | APPROVED | REJECTED`
- `TimesheetStatus`: `SUBMITTED | APPROVED | DISPUTED`
- `PaymentStatus`: `PENDING | APPROVED | RELEASED | DISPUTED`

## Entities (Prisma models: backend owns exact schema)
- **User**: `id, name, email, passwordHash, role, tiers (Tier[]), kycStatus, location, rating (float?), completedCount (int), bankMasked (string?), createdAt`
- **Task**: `id, title, description, category, tier, payModel, rate (int?), budget (int?), startDate, endDate, locationType, address?, geofenceRadius (int default 100), slots (int), status, deadline, createdById, createdAt`
- **Application**: `id, taskId, workerId, pitch?, status, reason?, createdAt`
- **Timesheet**: `id, taskId, workerId, periodStart, periodEnd, hours (float), status, gpsNote?, createdAt`
- **Payment**: `id, workerId, taskId, gross (int), whtRate (float), whtAmount (int), net (int), status, createdAt`
- **AuditLog**: `id, actorId, action, entity, entityId, meta (json/string), createdAt`

Derived **wallet** per worker: `pending = Σ net where status in (PENDING,APPROVED)`, `available = Σ net where RELEASED & not withdrawn`, `withdrawn` (mock 0 for MVP).

---

## Endpoints

### Auth
- `POST /api/auth/login` → body `{email, password}` → `200 {token, user}` | `401 {error}`
- `GET /api/auth/me` → `{user}` (requires auth)

Seed an admin: **email `admin@afrizone.work` / password `afrizone123`** (role SUPER_ADMIN).

### Dashboard
- `GET /api/dashboard/stats` →
```json
{
  "activeTasks": 38,
  "fillRate": 87,
  "avgTimeToFillHours": 6,
  "spendThisMonth": 4860000,
  "budgetThisMonth": 5400000,
  "spendByCategory": [{"label":"Dispatch","value":62,"tone":"clay"}, ...],
  "fill": {"filled":132,"open":20},
  "urgent": [{"type":"payments","title":"12 payments ready to release","sub":"₦486,000 net","count":12}, ...],
  "activity": [{"icon":"check","title":"Amaka O. approved","sub":"Mall activation","ago":"2m"}, ...]
}
```
(Compute what you can from seeded data; static-ish values acceptable for chart breakdowns.)

### Tasks
- `GET /api/tasks` → `Task[]` each augmented with `filledCount (int)`, `applicantCount (int)`
- `POST /api/tasks` → body = task fields (title, description, category, tier, payModel, rate|budget, startDate, endDate, locationType, address?, geofenceRadius?, slots, deadline) → `201 Task`
- `GET /api/tasks/:id` → `Task` + `applications: Application[]` (with worker summary)
- `PATCH /api/tasks/:id` → partial update → `Task`

### Applications
- `GET /api/applications?status=APPLIED` → `Application[]` joined with `worker {id,name,tiers,kycStatus,rating}` and `task {id,title}`
- `POST /api/applications/:id/approve` → `Application` (also bumps task filled; on full → task FILLED)
- `POST /api/applications/:id/reject` → body `{reason}` → `Application`

### Timesheets
- `GET /api/timesheets?status=SUBMITTED` → joined with worker + task + computed `slaHoursLeft`
- `POST /api/timesheets/:id/approve` → creates a `Payment` (PENDING→APPROVED) computing gross from `hours*task.rate` (or task.budget for FIXED)
- `POST /api/timesheets/:id/dispute` → body `{reason}`

### Payments
- `GET /api/payments?status=` → `Payment[]` joined with `worker {id,name}` and `task {id,title}`; include `gross, whtRate, whtAmount, net, status`
- `POST /api/payments/:id/release` → sets RELEASED, writes AuditLog → `Payment`
- `POST /api/payments/release-all` → releases all APPROVED → `{released: n, totalNet}`

### Workers
- `GET /api/workers` → users where role=WORKER: `{id,name,email,tiers,kycStatus,completedCount,rating}`
- `GET /api/workers/:id` → full worker + their applications/payments summary
- `POST /api/workers/:id/kyc` → body `{decision: "TIER_APPROVED"|"REJECTED"}` → updates kycStatus, AuditLog

---

## Error shape
All errors: `{ "error": "human message" }` with appropriate HTTP status (400/401/403/404/500).

## CORS
Backend enables CORS for `http://localhost:5173` (Vite dev) and same-origin.

## Seed data (must match prototype demo)
Workers: Amaka Obi (PROMO, VERIFIED, 47, 4.9), Tunde Bello (DISPATCH, VERIFIED, 89, 4.8), Ngozi Eze (REMOTE, PENDING, 12, 4.7), Ibrahim Kola (DISPATCH, VERIFIED), Funke Ade (PROMO).
Tasks: "Same-day parcel runs: Yaba" (DISPATCH, HOURLY ₦2500), "Weekend mall activation: Ikeja" (PROMO, FIXED ₦18000, 5 slots), "Product data cleanup: 20h" (REMOTE, HOURLY ₦1800), "AC servicing: Lekki" (TRADE, FIXED ₦45000), "Campus survey: UNILAG" (STUDENT, HOURLY ₦1200, 10 slots).
Payments: Amaka ₦18,000 (APPROVED), Tunde ₦12,500 (review/PENDING), Ngozi ₦36,000 (APPROVED), Ibrahim ₦9,000 (APPROVED), Funke ₦24,000 (DISPUTED). Net = gross − 5% WHT.

---

# API Contract v2: Hiring, Reports, Settings

## New enums
- `EmploymentType`: `FULL_TIME | PART_TIME | CONTRACT`
- `JobStatus`: `OPEN | CLOSED`
- `Stage`: `SCREENING | INTERVIEW | OFFER | HIRED | REJECTED`

## New entities (Prisma)
- **Job**: `id, title, department, location, employmentType, salaryMin (int?), salaryMax (int?), description, needsCv (bool default true), needsCover (bool default false), needsPortfolio (bool default false), closingDate, status (JobStatus default OPEN), createdById, createdAt`
- **JobApplication** (candidate): `id, jobId, name, email, phone?, stage (Stage default SCREENING), cvNote?, rating (float?), createdAt, updatedAt`
- **TaxRate**: `id, jurisdiction (e.g. "Federal", "Lagos"), category (e.g. "Services", "default"), whtRate (float), vatRate (float), active (bool default true)`
- **Category** (task categories config): `id, name, tier (Tier), defaultPayModel (PayModel), active (bool default true)`

(Settings templates can be a simple `Setting` key/value store: `Setting { key (unique), value (String/JSON) }`: used for notification/contract templates.)

## Hiring endpoints
- `GET /api/jobs` → `Job[]` augmented with `candidateCount (int)`
- `POST /api/jobs` → body (title, department, location, employmentType, salaryMin?, salaryMax?, description, needsCv?, needsCover?, needsPortfolio?, closingDate) → `201 Job`
- `GET /api/jobs/:id` → `Job` + `candidates: JobApplication[]`
- `PATCH /api/jobs/:id` → partial update (e.g. status) → `Job`
- `GET /api/candidates?jobId=` → `JobApplication[]` joined with `job {id,title}`. The frontend groups these into a kanban by `stage`.
- `POST /api/candidates` → body (jobId, name, email, phone?, cvNote?) → `201 JobApplication` (stage SCREENING)
- `POST /api/candidates/:id/move` → body `{stage: Stage}` → `JobApplication`; writes AuditLog (`"candidate.move"`). (This is where status-emails would fire: model only.)

## Reports endpoints
- `GET /api/reports/summary` →
```json
{
  "spendByMonth": [{"month":"Jan","spend":1200000},{"month":"Feb","spend":1450000}, ... up to 6 months],
  "spendByCategory": [{"label":"Dispatch","amount":540000,"pct":31}, ...],
  "spendByDepartment": [{"label":"Logistics","amount":680000}, ...],
  "tax": {"whtCollected": 124300, "vatCollected": 0, "remittedToFirs": 124300},
  "fillRateTrend": [{"month":"Jan","rate":74}, ...],
  "payrollEquivalent": {"grossPaid": 2486000, "totalWht": 124300, "netPaid": 2361700, "workersPaid": 38},
  "topCategories": [{"label":"Promo","tasks":18,"spend":540000}, ...]
}
```
Compute `tax.whtCollected`, `payrollEquivalent`, and `spendByCategory` from real Payment rows (status RELEASED + APPROVED). Monthly/trend arrays may be illustrative if history is thin: return at least the current month from real data.

## Settings endpoints
- `GET /api/settings/tax-rates` → `TaxRate[]`
- `POST /api/settings/tax-rates` → create → `201 TaxRate`
- `PATCH /api/settings/tax-rates/:id` → update (whtRate, vatRate, active) → `TaxRate`
- `GET /api/settings/categories` → `Category[]`
- `POST /api/settings/categories` → create → `201 Category`
- `PATCH /api/settings/categories/:id` → update → `Category`
- `GET /api/settings/templates` → `{key,value}[]` (notification/contract templates)
- `PUT /api/settings/templates/:key` → body `{value}` → `{key,value}`

All v2 mutating routes require auth; tax-rate / category / template writes require role SUPER_ADMIN.

## v2 seed data
- **Jobs**: "Operations Associate" (Logistics, FULL_TIME, ₦250k–₦400k), "Field Marketing Lead" (Marketing, FULL_TIME, ₦350k–₦500k), "Customer Support (Remote)" (Support, PART_TIME, ₦120k–₦180k).
- **Candidates** (spread across stages): ~8 across the 3 jobs: e.g. SCREENING×3, INTERVIEW×2, OFFER×1, HIRED×1, REJECTED×1, with Nigerian names.
- **TaxRates**: Federal · Services · WHT 5% · VAT 7.5% (active); Lagos · default · WHT 5% · VAT 0% (active).
- **Categories**: Dispatch (DISPATCH, HOURLY), Promo (PROMO, FIXED), Remote (REMOTE, HOURLY), Trade (TRADE, FIXED), Student (STUDENT, HOURLY): all active.
- **Templates**: keys `contract.default`, `notify.application_approved`, `notify.payment_available` with short placeholder strings.

---

# API Contract v3: Worker-facing endpoints (mobile app)

All routes here are **worker-scoped**: `requireAuth`, and the acting worker is the JWT subject (`req.user.sub`). Never trust a workerId from the body for "me" data. The mobile app logs in via the existing `POST /api/auth/login` (seeded workers: `<first>.<last>@afrizone.work` / `worker123`).

## New enums
- `ClockType`: `IN | OUT`
- `WithdrawalStatus`: `PROCESSING | PAID`
- `ContractStatus`: `PENDING_SIGNATURE | SIGNED`

## New entities (Prisma)
- **ClockEvent**: `id, workerId, taskId, type (ClockType), lat (float?), lng (float?), withinFence (bool), note?, createdAt`
- **Withdrawal**: `id, workerId, amount (int), bankMasked (string), status (WithdrawalStatus default PROCESSING), createdAt`
- **Contract**: `id, taskId, workerId, status (ContractStatus default PENDING_SIGNATURE), signedAt (DateTime?), createdAt`

## Profile & tasks
- `GET /api/me` → the authed worker: `{id,name,email,tiers (string[]),kycStatus,location?,bankMasked?,rating,completedCount}`
- `GET /api/me/applications` → worker's applications, each joined with `task` summary `{id,title,category,tier,payModel,rate,budget,status,address,locationType,startDate,endDate}` and `status`. The app buckets these: **Applied** = APPLIED, **Active** = APPROVED (+ task not CLOSED), **Completed** = task CLOSED/ARCHIVED.
- `POST /api/applications` → body `{taskId, pitch?}` (worker apply). Guards (return 400/409 with `{error}`): task must exist & be OPEN, deadline not passed, worker's `tiers` must include `task.tier`, no duplicate application by this worker for this task. → `201 Application`.

## Clock in/out (field tasks)
- `POST /api/clock` → body `{taskId, type:"IN"|"OUT", lat?, lng?}`. Compute `withinFence`: if the task is PHYSICAL and lat/lng given, true when within `task.geofenceRadius` metres of the task location (you may store task lat/lng on Task or treat any provided coords as in-fence for the demo: document the choice). Persist a ClockEvent. → `{event, clockedIn: boolean, elapsedSeconds}` where clockedIn reflects the latest event for that task.
- `GET /api/me/clock/:taskId` → `{clockedIn, lastEventAt, elapsedSeconds}` for resuming the active-task screen.

## Timesheets (worker submit)
- `POST /api/timesheets` → body `{taskId, periodStart, periodEnd, hours}` → creates a **SUBMITTED** timesheet for the authed worker → `201`. (Admin approval already exists at `POST /api/timesheets/:id/approve`, which generates the Payment.)

## Wallet
- `GET /api/me/wallet` → `{pending, available, withdrawn}` (same derivation as worker detail; `withdrawn` = Σ Withdrawal.amount).
- `GET /api/me/transactions` → merged, newest-first: earnings + withdrawals as `{id, kind:"earning"|"withdrawal", title, amount (int), status, createdAt}` (earning title = task title; withdrawal title = "Withdrawal to <bankMasked>").
- `POST /api/wallet/withdraw` → body `{amount}`. Guards: `amount` integer, ≥ ₦5,000 min, ≤ available. Creates a Withdrawal (PROCESSING) using the worker's `bankMasked`. → `201 Withdrawal`. (T+1 settlement is modelled, not real.)

## Contracts
- `GET /api/me/contracts` → worker's contracts joined with `task {id,title}`, `{id,status,signedAt,task}`.
- `POST /api/contracts/:id/sign` → marks SIGNED + `signedAt` (must belong to the authed worker) → `Contract`.
- **Tie-in:** when an admin approves an application (`POST /api/applications/:id/approve`), also auto-create a `Contract` (PENDING_SIGNATURE) for that worker+task if none exists. "Active" in the app = approved **and** contract SIGNED.

## KYC (worker submit: demo-simple)
- `POST /api/me/kyc/submit` → body `{tin?, bankMasked?, tier?}`. Stores provided fields; if `tier` given and not already present, append to `tiers`. Sets `kycStatus = PENDING`. → updated `GET /api/me` shape. (Admin still finalises via `POST /api/workers/:id/kyc`.)

## v3 seed additions (so the mobile app shows real data on first run)
Give **Amaka Obi** a live worker journey: an **APPROVED** application on "Weekend mall activation: Ikeja" with a **PENDING_SIGNATURE** Contract; an **APPLIED** application on another task; one **IN** ClockEvent (within fence) on an active task; one **SUBMITTED** timesheet; keep her existing ₦18,000 APPROVED Payment; and one example **Withdrawal** (₦10,000, PROCESSING). Other workers can stay as-is.

---

# Payments provider: Paystack Transfers (payouts)

Env-driven. `PAYSTACK_SECRET` blank → **SIMULATED** mode (no money moves, withdrawals stay PROCESSING). Set the secret → **LIVE**: withdrawal creates a Paystack transfer recipient + initiates a transfer; the webhook settles it.

- `WithdrawalStatus` now `PROCESSING | PAID | FAILED`.
- `Withdrawal` gains `provider ("paystack"|"simulated")`, `reference` (our idempotency key), `providerRef` (Paystack transfer_code), `failureReason?`.
- `User` gains `bankAccountNumber?`, `bankCode?`, `bankName?` (required for live transfers; demo NUBAN seeded on Amaka).
- `POST /api/wallet/withdraw`: unchanged request `{amount}`. In live mode without payout bank details → `400`. On provider error → withdrawal FAILED + `502`. Otherwise `201` Withdrawal (PROCESSING; `simulated:true` flag in sim mode).
- `POST /api/webhooks/paystack`: verifies `x-paystack-signature` (HMAC-SHA512 over raw body); on `transfer.success` → PAID, on `transfer.failed`/`transfer.reversed` → FAILED. Always `200`. Set this URL in the Paystack dashboard (use an ngrok/tunnel in dev).
- `POST /api/wallet/dev/settle`: **dev only** (sim mode): flips the caller's PROCESSING withdrawals to PAID so the full flow can be demoed without webhooks. Returns `403` when live.

# Platform funding (Paystack inbound: Afrizone Mart funding the wallet)

Env-driven, same `PAYSTACK_SECRET` gate as payouts. `PAYSTACK_SECRET` blank → **SIMULATED** (no real charge, `Funding` stays PENDING). Set the secret → **LIVE**: admin gets redirected to a real Paystack hosted-checkout page; the webhook settles it. Informational only for now: the platform balance is not used to gate withdrawal approval.

- `Funding` model: `id, amount, status (PENDING|SUCCESS|FAILED), provider ("paystack"|"simulated"), reference, providerRef?, initiatedBy, createdAt`.
- Platform balance is derived, not stored: `Σ SUCCESS Funding.amount − Σ non-failed Withdrawal.amount`.
- `GET /api/admin/funding/balance` (SUPER_ADMIN) → `{balance}`.
- `GET /api/admin/funding` (SUPER_ADMIN) → funding history, newest first, with `admin {id, name}`.
- `POST /api/admin/funding/initialize` (SUPER_ADMIN): body `{amount}`. Creates a PENDING Funding row. Live mode also returns `authorizationUrl` (Paystack hosted checkout) for the admin web to redirect to; sim mode returns `{simulated: true}`.
- `POST /api/webhooks/paystack`: now also handles `charge.success`/`charge.failed`, matched by `reference` (or `providerRef`/access_code), flipping the matching `Funding` to SUCCESS/FAILED.
- `POST /api/admin/funding/dev/settle`: **dev only** (sim mode): flips all PENDING fundings to SUCCESS. Returns `403` when live.

# Contract e-signature (typed-name)

`Contract` gains `signerName?, signerIp?, signatureHash?` alongside the existing `status`/`signedAt`. Signing is a typed full-name signature (no drawn/image capture): the worker types their legal name, which is stored verbatim along with the requesting IP and a SHA-256 hash of `${contractId}:${workerId}:${signerName}:${signedAt.toISOString()}` for tamper-evidence.

- `POST /api/contracts/:id/sign`: body `{signerName}` (required, ≥2 chars after trim, else `400`). Sets `status: SIGNED`, `signedAt`, `signerName`, `signerIp`, `signatureHash`. Ownership-checked; `400` if already signed.
- The rendered "Entire Agreement" section now reads "Digitally signed by `{signerName}` on `{date}`" (falls back to the worker's profile name if `signerName` is absent, e.g. legacy contracts signed before this change).
- No admin-web contract viewer exists: out of scope for this pass.
