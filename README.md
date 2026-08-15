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
    ├── server/              # Backend: Node + TypeScript + Express + Prisma
    ├── web-admin/           # Admin console: Vite + React + TS, premium dark-glass UI
    └── mobile/              # Worker app: Expo + expo-router + TS
```

## Stack

| Layer | Tech | Notes |
|---|---|---|
| **Database** | Prisma ORM over **D1** (Cloudflare's SQLite-based database), locally and in production | Same SQLite schema everywhere, via `@prisma/adapter-d1`; see `server/README.md`. |
| **Backend** | Express + TypeScript + JWT + bcrypt, on **Cloudflare Workers** | REST API under `/api`, deployed via Workers Builds on push to `main`. |
| **Admin web** | Vite + React + TypeScript + React Router | SPA on `:5173`, dark glassmorphism UI (clay/gold/forest brand, Bricolage Grotesque + Inter). |
| **Mobile** | Expo (expo-router) + TypeScript | Worker-facing app: onboarding/KYC, task feed, clock-in/geofence, wallet, contracts. |

## What's built

- **Auth & onboarding**: workers: passwordless phone+OTP; admins: email/password +
  mandatory TOTP 2FA + Google SSO; forgot/reset password. All external providers
  (SMS, Google, SMTP) are env-gated and run in a simulated dev mode when unconfigured.
- **Task lifecycle**: post → apply → approve/reject → e-signed contract → clock
  in/out (geofenced) or fixed-fee completion → timesheet approval → wallet payout.
- **KYC**: tiered document upload + admin review, with optional Smile ID document
  verification (falls back to manual review when unconfigured).
- **Payments**: Paystack payouts on withdrawal + inbound platform funding, both
  env-gated to a simulated mode by default (no real transfers without a live key).
  WHT (5%) computed at source.
- **Hiring pipeline**: full-time job postings, candidate pipeline
  (screening → interview → offer → hired/rejected).
- **Disputes**, **push notifications** (FCM), **reports/analytics**, **admin
  settings** (tax rates, categories, templates), audit log on every state transition.
- **Ops**: GitHub Actions CI (server/web-admin/mobile), automated integration
  tests (`server/test/`, `@cloudflare/vitest-pool-workers`), security hardening
  pass, deployed to Cloudflare (Workers + D1 + R2 for the API, Pages for
  web-admin).

## Run it locally (three terminals)

**1: Backend**
```bash
cd app/server
npm install
npx prisma generate
npx wrangler d1 migrations apply afrizone-db --local
npm run seed        # demo data - also applies it to the local D1 emulation
npm run dev          # wrangler dev - see its output for the local URL
```

**2: Admin web**
```bash
cd app/web-admin
npm install
npm run dev         # → http://localhost:5173
```

**3: Mobile (worker app)**
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

> `npm run seed` (`server/prisma/seed.ts`) writes through a plain Prisma
> client against `DATABASE_URL` as before, then dumps the result to SQL and
> applies it to `wrangler dev`'s local D1 emulation via
> `wrangler d1 execute --local` - the demo logins above work against both.

See each app's own README for details: [`server/README.md`](app/server/README.md),
[`web-admin/README.md`](app/web-admin/README.md), [`mobile/README.md`](app/mobile/README.md).

## Production deployment

Both the API and web-admin run on Cloudflare, auto-deploying on push to `main`:

- **API**: Cloudflare Workers (`app/server`), via Workers Builds - runs
  `wrangler deploy`, which reads `app/server/wrangler.jsonc` (D1 + R2 bindings,
  non-secret config). Secrets (`JWT_SECRET`, `PAYSTACK_SECRET`, etc.) are set
  via `wrangler secret put` or the dashboard's Settings → Variables and
  Secrets, listed in `app/server/.env.production.example`. Live at
  `https://api.parttime.afrizonemart.com` - **never `api.afrizonemart.com`**,
  which is Afrizoma's separate e-commerce backend on Railway.
- **web-admin**: Cloudflare Pages (`app/web-admin`), via the dashboard's Git
  integration - runs `npm run build`. Env vars (`VITE_API_URL`, etc.) are set
  per-environment in the Pages project settings, listed in
  `app/web-admin/.env.production.example`. Live at
  `https://admin.parttime.afrizonemart.com` (`https://afrizone.pages.dev`
  still works) - **never `admin.afrizonemart.com`**, Afrizoma's own admin
  domain.
- **mobile**: not hosted - `EXPO_PUBLIC_API_URL` is injected at build time via
  `app/mobile/eas.json`'s `preview`/`production` profiles for EAS builds; local
  dev still points at your LAN IP via `app/mobile/.env` (gitignored).
