# Afrizone Part Time — Admin Web

Premium dark-glassmorphism admin console for the Afrizone Part Time gig platform.
Built with **Vite + React + TypeScript + React Router v6** and plain CSS ported from
the `admin-premium.html` prototype (clay/gold/forest brand, Bricolage Grotesque +
Inter, animated gradient-mesh background, KPI count-ups, animated bar/donut, glass
tables, task cards with hover spotlight).

## Getting started

```bash
npm install
npm run dev
```

The dev server runs on **http://localhost:5173** and proxies `/api` →
**http://localhost:4000**, so the backend API must be running on port 4000.

### Login

```
admin@afrizone.work / afrizone123
```

The JWT is stored in `localStorage`; protected routes redirect to `/login` when no
valid session is present.

## Scripts

| Command           | Description                                  |
| ----------------- | -------------------------------------------- |
| `npm run dev`     | Start the Vite dev server (port 5173)        |
| `npm run build`   | Type-check (`tsc -b`) and build for prod     |
| `npm run preview` | Preview the production build                 |

## What's wired

| Route            | API                                                                       |
| ---------------- | ------------------------------------------------------------------------- |
| `/` Dashboard    | `GET /api/dashboard/stats` — KPIs (count-up), bar chart, donut, urgent, activity |
| `/tasks`         | `GET /api/tasks`, `POST /api/tasks` (New task modal)                       |
| `/applications`  | `GET /api/applications?status=APPLIED`, approve / reject-with-reason       |
| `/timesheets`    | `GET /api/timesheets?status=SUBMITTED`, approve / dispute, SLA countdown   |
| `/payments`      | `GET /api/payments`, `POST /payments/:id/release`, `release-all`; gross → −WHT → net |
| `/workers`       | `GET /api/workers`, `POST /workers/:id/kyc` (approve / reject)             |

Every page renders explicit **loading / error / empty** states. Money uses the
`formatNaira` helper (₦ + thousands separators, `tabular-nums`). Status is never
communicated by colour alone — every pill carries an icon and a word.

## Project structure

```
src/
  api/        client.ts (fetch wrapper + auth), types.ts (contract types)
  auth/       AuthContext.tsx (login/logout/me + ProtectedRoute)
  components/ AppShell, Sidebar, Topbar, Background, PageHeader, Icon
    ui/       Button, Glass, StatusPill, KpiCard, Modal, StateView
  lib/        format.ts, useApi.ts, useCountUp.ts
  pages/      Login, Dashboard, Tasks, Payments, Workers, Applications, Timesheets
  styles/     tokens.css, global.css
```

Respects `prefers-reduced-motion`, uses visible focus rings, and keeps 44px tap targets.
