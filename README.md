# Afrizone Part Time

A full-stack gig & hiring platform: Afrizone Mart posts paid tasks and full-time
roles, KYC-verified workers apply, complete, and get paid straight to a wallet.

Three real, runnable apps sharing one API contract:

```
afrizone/
├── admin-premium.html      # static high-fidelity prototype the admin web reproduces
├── design-system.html      # living brand & token showcase
├── DESIGN_SPEC.md          # brand, IA, flows, component inventory, screen specs
└── app/
    ├── API_CONTRACT.md     # shared source of truth (entities, endpoints, shapes)
    ├── AUTH_FLOW.md         # auth/onboarding spec (phone+OTP, email/password, Google SSO, 2FA)
    ├── server/              # Backend — Node + TypeScript + Express + Prisma
    ├── web-admin/           # Admin console — Vite + React + TS, premium dark-glass UI
    └── mobile/              # Worker app — Expo + expo-router + TS
```

## Stack

| Layer | Tech | Notes |
|---|---|---|
| **Database** | Prisma ORM — **SQLite** for zero-install local dev, **PostgreSQL** for production | One env-var + a Prisma datasource switch; see `server/README.md`. |
| **Backend** | Express + TypeScript + JWT + bcrypt | REST API on `:4000` under `/api`. Dockerfile + docker-compose included for a Postgres-backed prod image. |
| **Admin web** | Vite + React + TypeScript + React Router | SPA on `:5173`, dark glassmorphism UI (clay/gold/forest brand, Bricolage Grotesque + Inter). |
| **Mobile** | Expo (expo-router) + TypeScript | Worker-facing app: onboarding/KYC, task feed, clock-in/geofence, wallet, contracts. |

## What's built

- **Auth & onboarding** — workers: passwordless phone+OTP; admins: email/password +
  mandatory TOTP 2FA + Google SSO; forgot/reset password. All external providers
  (SMS, Google, SMTP) are env-gated and run in a simulated dev mode when unconfigured.
- **Task lifecycle** — post → apply → approve/reject → e-signed contract → clock
  in/out (geofenced) or fixed-fee completion → timesheet approval → wallet payout.
- **KYC** — tiered document upload + admin review, with optional Smile ID document
  verification (falls back to manual review when unconfigured).
- **Payments** — Paystack payouts on withdrawal + inbound platform funding, both
  env-gated to a simulated mode by default (no real transfers without a live key).
  WHT (5%) computed at source.
- **Hiring pipeline** — full-time job postings, candidate pipeline
  (screening → interview → offer → hired/rejected).
- **Disputes**, **push notifications** (FCM), **reports/analytics**, **admin
  settings** (tax rates, categories, templates), audit log on every state transition.
- **Ops** — GitHub Actions CI (server/web-admin/mobile), automated integration
  tests (`server/test/`), production Dockerfile + docker-compose, security
  hardening pass, verified Postgres production path.

## Run it locally (three terminals)

**1 — Backend**
```bash
cd app/server
npm install
npm run setup     # prisma generate + db push + seed demo data
npm run dev        # → http://localhost:4000
```

**2 — Admin web**
```bash
cd app/web-admin
npm install
npm run dev         # → http://localhost:5173
```

**3 — Mobile (worker app)**
```bash
cd app/mobile
npm install
npx expo start       # press i / a / w, or scan the QR with Expo Go
```

### Demo logins
| Role | Credentials |
|---|---|
| Admin (Super Admin) | `admin@afrizone.work` / `afrizone123` |
| Worker | `<first>.<last>@afrizone.work` / `worker123`, or phone+OTP with master code `123456` |

2FA is off by default for admins; the dev bypass code is `000000` when enabled.

See each app's own README for details: [`server/README.md`](app/server/README.md),
[`web-admin/README.md`](app/web-admin/README.md), [`mobile/README.md`](app/mobile/README.md).

## Production deployment

The server ships a production `Dockerfile` targeting PostgreSQL
(`app/server/Dockerfile`, `docker-compose.yml`). Env var checklists for a
split deploy (API + static admin frontend on separate hosts/domains) live in
`app/server/.env.production.example` and `app/web-admin/.env.production.example`.
