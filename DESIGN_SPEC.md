# Afrizone Part Time — Design Specification v0.1

**Companion to:** Product Blueprint v1.0
**Covers:** Brand & design system, information architecture, key flows, component inventory, and screen-by-screen specs for the **Worker mobile app** and the **Admin web dashboard**.
**Status:** Visual direction for kickoff — to be validated against the live `design-system.html` showcase before screen production.

---

## 0. Design Principles

These five principles resolve trade-offs when specs are silent.

1. **Trust is the product.** Money and identity move through this app. Every screen should feel safe, legible, and predictable. No dark patterns, no surprise deductions — show the math (gross → WHT/VAT → net) plainly.
2. **Built for the field, on a cheap phone, on bad network.** Big tap targets, offline-tolerant flows, clear sync state, low data weight. Performance is a feature.
3. **Warm, rooted, and unmistakably African — not generic fintech.** The brand draws on West-African earth tones and Adinkra/kente geometry, expressed with restraint so data stays clear.
4. **One status language everywhere.** Pending / Active / Approved / Paid use the same colors, words, and pill shape across mobile and web. A worker and a manager describe the same state with the same word.
5. **Progressive disclosure.** KYC, task posting, and tax detail are heavy. Reveal in steps; never wall a 12-field form in front of a first-time user.

---

## 1. Brand Foundation — Afrizone

### 1.1 Concept
Afrizone connects people to honest, flexible work across Africa. The identity blends **earth** (clay, soil, savanna gold) with **growth** (deep palm green) and **craft** (Adinkra-inspired geometry). The feeling: warm, capable, locally proud, financially trustworthy.

### 1.2 Logo mark
A geometric **"A" formed from an Adinkra-style motif** — interlocking chevrons suggesting both an *A* and forward motion / a sunrise over land. Used as a rounded-square app icon on a clay→gold gradient. Full wordmark: **Afrizone** in the display face, with "Part Time" as a lighter sub-label.

### 1.3 Color system

Primary brand:
| Token | Hex | Use |
|---|---|---|
| `--clay-600` (primary) | `#C2502E` | Primary brand, key CTAs, active nav |
| `--clay-500` | `#D2691E` | Hover/lighter clay |
| `--gold-500` (accent) | `#E9A23B` | Highlights, gradient partner, badges, accents |
| `--forest-900` (ink) | `#14302B` | Dark surfaces, headers, primary text on light |
| `--forest-700` | `#1E4B41` | Secondary dark, dark-mode cards |

Functional / semantic (shared status language):
| Token | Hex | Meaning |
|---|---|---|
| `--money-600` | `#1F9D6B` | Available balance, Paid, success |
| `--indigo-600` | `#2D5BA8` | Info, links, "in review" (adire indigo) |
| `--amber-500` | `#E08A1E` | Pending, warning, awaiting approval |
| `--danger-600` | `#C8453A` | Errors, rejected, disputes |

Neutrals (warm-tinted, never pure gray):
| Token | Hex |
|---|---|
| `--sand-50` (app bg) | `#FBF5EC` |
| `--sand-100` (surface) | `#F4EADB` |
| `--surface` (card) | `#FFFFFF` |
| `--line` | `#E7DCC9` |
| `--text` | `#241C15` |
| `--text-muted` | `#7A6B58` |

**Status → color → word (canonical):**
- `Pending` → amber → "Awaiting approval"
- `Active` → clay → "In progress"
- `In review` → indigo → "Under review"
- `Approved / Available` → money green → "Ready to withdraw"
- `Paid / Withdrawn` → forest → "Paid out"
- `Rejected / Dispute` → danger → "Needs attention"

Dark mode: forest-900 base, sand text, clay/gold accents retained. Designed as a pair (per blueprint §9 `dark-mode-pairing`).

### 1.4 Typography
- **Display / headings:** `Bricolage Grotesque` (700/800) — characterful, warm, modern-African editorial feel.
- **Body / UI:** `Inter` (400–600) — neutral, legible at small sizes, great for data and forms.
- **Numeric / money:** `Inter` with `font-variant-numeric: tabular-nums` so balances and timesheets align.

Scale (mobile / web): 12, 13, 14 (base), 16, 18, 20, 24, 30, 38, 48. Body base **16px**, line-height **1.5** (blueprint §6 Typography rules).

### 1.5 Shape, depth, motion
- **Radius:** inputs/buttons 12px, cards 16px, sheets 22px, pills 100px.
- **Depth:** soft warm shadows (`0 12px 30px rgba(36,28,21,.10)`); restrained — this is fintech, not glass.
- **Pattern:** subtle Adinkra/kente SVG motifs at 3–6% opacity for headers, empty states, and brand moments only — never behind dense data.
- **Motion:** 150–300ms, `cubic-bezier(.22,1,.36,1)`. Motion conveys spatial continuity (sheets rise, steps slide). Respect `prefers-reduced-motion`.

### 1.6 Iconography
Single stroke set (Lucide, 2px). No emoji as icons (blueprint §4 `no-emoji-icons`). Custom brand glyphs only for the logo and tier badges.

---

## 2. Information Architecture

### 2.1 Worker mobile app — bottom tab nav (≤5, per blueprint §navigation)
```
[ Home ]  [ My Tasks ]  [ Wallet ]  [ Jobs ]  [ Profile ]
```
- **Home** — matched task feed, KYC nudge, earnings snapshot
- **My Tasks** — Applied / Active / Completed (segmented); active-task & clock-in live here
- **Wallet** — balances, transactions, withdraw, tax statements
- **Jobs** — full-time openings + applications
- **Profile** — tiers, KYC status, documents, bank, tax info, notification prefs, support

Onboarding/KYC is a **pre-tab gated flow** (full-screen stepper). Contracts and Notifications are accessed contextually + from Profile/Home.

### 2.2 Admin web dashboard — left sidebar
```
Dashboard
Tasks            (create / manage / archive)
Applications     (review queue)
Timesheets       (approval queue)
Payments         (release queue)
Workers          (directory + KYC review)
Hiring  ▸ Jobs   ▸ Candidates        (HR-scoped)
Reports
Settings ▸ Categories ▸ Tiers ▸ Tax rates ▸ Templates ▸ Notifications
```
Role gating: Task Manager sees Tasks→Payments scoped to dept/location; HR Admin adds Hiring; Super Admin sees everything incl. Audit log, KYC overrides, payment overrides.

---

## 3. Key User Flows (screen sequences)

### 3.1 Worker onboarding & KYC (gated stepper)
`Splash → Phone signup → OTP → Email verify → Tier select → ID upload (NIN/BVN/passport) → Selfie liveness → Tier docs (matric / license+vehicle / certification) → TIN capture → Bank account → Review submitted (Pending) → [async] Verified → Home`
- Each step is one screen with a progress rail (e.g. "3 of 9"), back/escape route, and inline validation.
- "Verify later" is allowed for non-blocking steps; **task application is blocked until Tier-Approved**, with a persistent banner explaining what's missing.

### 3.2 Task lifecycle (worker side)
`Home feed → Task detail → Apply (pitch + availability) → [Applied] → push: approved → Contract to sign → Sign → [Active] → Active-task screen → Clock in (geofence check) … Clock out → Submit/Complete → [Awaiting approval] → push: approved → Wallet: Available → Withdraw`

### 3.3 Task lifecycle (admin side)
`Tasks → New task (multi-section form) → Publish → Applications queue → Approve N (or reject w/ reason) → contracts auto-generate → Timesheets queue → Approve hours → Payments queue → Release → (funds to wallets)`

### 3.4 Hiring flow
`Admin: Jobs → New job → Publish` → `Worker: Jobs tab → Apply (CV/cover/portfolio)` → `Admin: Candidates pipeline (Screening → Interview → Offer → Hired/Rejected)` → auto status emails at each transition.

### 3.5 Money math (always visible)
Any earning surface shows: **Gross → − WHT (e.g. 5%) → − VAT flag (if applicable) → Net to wallet**, with a tappable "How is this calculated?" disclosure. Annual statement downloadable from Wallet.

---

## 4. Component Inventory (shared design system)

**Primitives:** Button (primary/secondary/ghost/danger), IconButton, Input, Textarea, Select, DatePicker, FileUpload/Dropzone, Checkbox, Radio, Switch, OTP input, Slider (geofence radius), SearchField.

**Status & data:** StatusPill (the 6 canonical states), TierBadge (Student/Rider/Freelancer/Promo/Trade), Avatar, ProgressRail (stepper), ProgressBar/Meter, Money (tabular, with currency), DataTable (sortable, admin), KPIStat card, Chart (bar/line/donut — legends + tooltips, not color-alone).

**Surfaces:** Card, ListRow, BottomSheet, Modal, Banner (KYC nudge / offline / dispute), Toast, Tabs/Segmented, EmptyState (with Adinkra motif), SkeletonLoader.

**App-specific:** TaskCard (feed), ApplicationRow, ClockInButton (with geofence state: in-fence / out-of-fence / syncing), GeofenceMap, TimesheetEntry, WalletBalanceCard (3 balances), TransactionRow, ContractViewer + SignaturePad, KYCStepCard, NotificationRow, CandidatePipelineColumn (kanban).

**Offline/sync:** SyncBadge (queued clock-events count), OfflineBanner, "Saved locally — will sync" inline note. (Blueprint §10 offline tolerance.)

---

## 5. Worker App — Screen Specs (highlights)

| Screen | Purpose | Key elements | States |
|---|---|---|---|
| **Splash / Auth** | Entry | Logo on clay→gold gradient + Adinkra motif; phone signup, login, forgot | loading, error |
| **KYC stepper** | Verify identity & tier | ProgressRail, one task per step, inline validation, escape route | empty, error, uploading, submitted/Pending |
| **Home feed** | Find work | Earnings snapshot card, KYC banner (if incomplete), "Matched for you" then "All open"; TaskCard list with tier badge, pay, distance/remote, deadline | empty (motif), loading skeletons, offline |
| **Task detail** | Decide & apply | Pay model (hourly/fixed) prominent, location/geofence map or "Remote", slots left, deadline, required docs, Apply CTA | applied (disabled CTA), closed, ineligible (tier locked) |
| **My Tasks** | Track | Segmented Applied/Active/Completed; rows show status pill | empty per segment |
| **Active task** | Do the work | Geofence status, big **Clock in/out** button, elapsed timer, submit deliverable / weekly timesheet, sync badge | in-fence, out-of-fence (blocked/warn per Open Q2), clocked-in, syncing, offline-queued |
| **Wallet** | Get paid | 3-balance card (Pending/Available/Withdrawn), money-math disclosure, transaction list, Withdraw sheet (bank, min threshold), tax statements | zero balance, below min, processing (T+1) |
| **Contracts** | Sign & store | Pending-signature list, ContractViewer, SignaturePad | unsigned, signed (PDF) |
| **Jobs** | Full-time | Openings list, job detail, apply (CV/cover/portfolio), my applications + stage | none open |
| **Profile** | Manage self | Tiers + add-tier, KYC status, documents, bank, tax info/TIN, notification prefs (per-event channels), support | re-KYC due banner (12-mo) |

## 6. Admin Dashboard — Screen Specs (highlights)

| Screen | Purpose | Key elements |
|---|---|---|
| **Dashboard** | At-a-glance | KPI row (active tasks, fill rate, time-to-fill, pending approvals), urgent-flags list, spend snapshot chart |
| **Task create** | Post work | Multi-section form: details → category/tier → pay model → schedule → location+geofence (map, radius slider) → slots → deadline → contract template; live preview |
| **Task manage** | Operate | DataTable (status, filled/slots, spend), filters, bulk actions, archive |
| **Applications queue** | Staff up | Applicant rows (tier, pitch, KYC ✓), approve/reject-with-reason, approve-N |
| **Timesheets queue** | Verify hours | Entries with GPS/clock log, approve/dispute, 24–48h SLA timer, auto-approval indicator |
| **Payments queue** | Release money | Per-worker net (gross−WHT−VAT), release/hold, batch release, audit note |
| **Workers / KYC** | Vet people | Directory + filters; KYC review detail (docs, liveness, tier docs), approve/override (Super Admin), re-KYC flag |
| **Hiring** | Recruit | Jobs list/create; Candidate **kanban** (Screening→Interview→Offer→Hired/Rejected) with auto-email on move |
| **Reports** | Account | Fill rate, spend by category/dept/month, WHT/VAT collected, payroll-equivalent finance view; export |
| **Settings** | Configure | Categories, tiers, **tax rate tables (per jurisdiction)**, contract & notification templates, roles |

---

## 7. Accessibility & quality bar (enforced)
- Contrast ≥ 4.5:1 body / 3:1 large (clay/forest on sand verified in showcase).
- Touch targets ≥ 44px; 8px+ spacing; `touch-action: manipulation`.
- Visible focus rings; labels with `for`; errors beside fields; heading hierarchy h1→h6.
- `prefers-reduced-motion` respected; never color-alone for status (pill has icon + word).
- Reserve space for async (no layout shift); skeletons for >1s; offline messaging.

---

## 8. Build plan (after visual sign-off)
1. **`design-system.html`** — living brand & component showcase (this is the source of truth for tokens). ← *next deliverable*
2. **Worker app hi-fi prototype** — phone-frame HTML of the §5 screens.
3. **Admin dashboard hi-fi prototype** — web HTML of the §6 screens.
4. **Code scaffold** — Expo (React Native) + React/Vite admin, sharing a `tokens` package generated from the showcase; NestJS API contract stubs to follow.

---

*End of design spec v0.1. Open product questions (§12 of blueprint) that affect UI — geofence hard-block vs warn, instant vs batch payout, external invite — are surfaced inline as state variations and flagged for decision.*
