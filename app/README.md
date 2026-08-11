# Afrizone Part Time: Full-Stack App

A real, runnable implementation of the Afrizone Part Time platform: **database + backend API + premium admin web frontend**, built to the [API_CONTRACT.md](./API_CONTRACT.md) and the [design system](../design-system.html).

```
app/
├── API_CONTRACT.md      # shared source of truth (entities, endpoints, shapes)
├── server/              # Backend: Node + TypeScript + Express + Prisma (SQLite → Postgres-ready)
└── web-admin/           # Frontend: Vite + React + TS, premium glassmorphism UI
```

## Architecture

| Layer | Stack | Notes |
|---|---|---|
| **Database** | Prisma ORM, **SQLite** (`dev.db`) | One-line switch to **PostgreSQL** for prod: see comment atop `server/prisma/schema.prisma`. Models: User, Task, Application, Timesheet, Payment, AuditLog. |
| **Backend** | Express + TypeScript + JWT + bcrypt | REST API on `:4000` under `/api`. Tax (WHT 5%) computed at source; timesheet approval generates Payments; payment release writes AuditLogs. |
| **Frontend** | Vite + React + TS + React Router | SPA on `:5173`, proxies `/api` → `:4000`. Dark glass UI: animated gradient mesh, KPI count-ups, animated charts, status pills, glass tables. |

## Run it (two terminals)

**1: Backend**
```bash
cd app/server
npm install
npm run setup     # prisma generate + db push + seed demo data
npm run dev       # → http://localhost:4000
```

**2: Frontend**
```bash
cd app/web-admin
npm install
npm run dev       # → http://localhost:5173
```

Open **http://localhost:5173** and log in:

> **admin@afrizone.work** / **afrizone123**  (Super Admin)
> Demo workers: `amaka.obi@afrizone.work` … / `worker123`

## What works today (verified end-to-end)
- JWT login + protected routes; `/auth/me` hydration.
- **Dashboard**: live KPIs (active tasks, fill rate, spend vs budget), animated spend-by-category bars, fill-rate donut, "needs attention" + activity feeds.
- **Tasks**: card grid with fill progress; "New task" modal creates real tasks (`POST /api/tasks`).
- **Payments**: glass table showing **gross → −WHT 5% → net**; per-row Release and Release-all (writes audit log).
- **Workers**: directory + KYC review (approve / reject).
- **Applications / Timesheets**: approve / reject / dispute with reason.

## Switch to PostgreSQL (production)
1. In `server/prisma/schema.prisma`: set `datasource db { provider = "postgresql" }` (uncomment the documented block; enums + `Tier[]` arrays can become native).
2. Set `DATABASE_URL` in `server/.env` to your Postgres connection string.
3. `npm run setup`.

## Not yet built (next steps)
- **Worker mobile app** (React Native / Expo): onboarding/KYC, task feed, clock-in/geofence, wallet. Design specced in [DESIGN_SPEC.md](../DESIGN_SPEC.md) §5.
- **Real provider integrations**: KYC (Smile Identity), payments (Paystack/Flutterwave), push (FCM), e-sign. Currently modelled as statuses only.
- Hiring pipeline, Reports, Settings pages (endpoints + UI).

## Design artifacts (in repo root `afrizone/`)
- `DESIGN_SPEC.md`: brand, IA, flows, component inventory, screen specs.
- `design-system.html`: living brand & token showcase.
- `admin-premium.html`: the static high-fidelity prototype this frontend reproduces.
