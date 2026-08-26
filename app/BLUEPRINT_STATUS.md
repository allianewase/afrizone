# PartTime Blueprint v0.1 — where the build actually stands

The blueprint is the governing specification. This file reconciles it against
what exists, so nobody has to read 16 sections and 30 tables side by side to find
out what is done.

**Headline: of the ten things Blueprint §15 lists for Phase 1, seven are
finished and three are partial. Nothing is untouched.** The three that remain
are each blocked on something outside the codebase — a verification provider, a
courier onboarding decision, and a screen for data the API already returns.

Living document. When it stops matching the code, the code is right.

---

## 1. Phase 1 (MVP), item by item

Blueprint §15 defines Phase 1 as: *Tasker + Courier + Store sign-up & KYC;
manual + basic auto task creation; contract lifecycle; wallet & escrow; map of
approved stores; two-way ratings.*

| Phase 1 item | Status | Where it stands |
|---|---|---|
| Tasker sign-up & KYC | **Built** | Phone-OTP and email sign-up, an 8-step KYC stepper, document upload to R2, Smile Identity when configured, manual admin review otherwise |
| Courier sign-up & KYC | **Partial** | `accountType: COURIER` exists; `Driver's licence` and `Vehicle registration` exist as credential types. No courier-specific onboarding flow, no insurance field |
| Store sign-up & KYC | **Partial** | `Organization`, membership, admin approval, a `tin` field, and a premises audit raised as gated paid work (§8) are live. No CAC verification — the one remaining gap, and it needs a provider |
| Manual task creation | **Built** | Two-step admin form with a live qualifying-worker count |
| Basic auto task creation | **Built** | One signed inbound endpoint, an event ledger, per-type de-duplication, and admin-editable generation rules. `order.confirmed` records DEFERRED — delivery does not exist to generate |
| Contract lifecycle | **Built** | An explicit state machine — nine states and a table of legal moves, against the two it had. The blueprint names eleven; the two absent are stages this build reaches through the task, not the contract |
| Wallet | **Built** | Derived balance, withdrawals, Paystack transfers, webhook settlement |
| Escrow | **Built** | `Commitment` records the ring-fence — COMMITTED on a live contract, RELEASED on verified acceptance. Mart holds the money throughout; see §4 |
| Map of approved stores | **Partial** | `GET /api/organizations/map` returns approved stores by distance, filtered by kind. No screen renders it yet — the gap is a view, not data |
| Two-way ratings | **Built** | `Rating.direction` splits OF_WORKER from OF_EXPERIENCE, so a Tasker rates the job back and the two averages never mix |

---

## 2. What the blueprint describes that is already live

Worth knowing before anyone rebuilds it.

**Qualification gating (§3.1, §6.1) is finished.** The blueprint asks that *"the
system computes which skill roles and task tiers the verified profile unlocks"*
and that an auditor task require a verified auditor credential. That is
`services/eligibility.ts`: skills are self-declared and gate nothing, credentials
are checked by a person and do gate work, requirements are set per task, and the
worker is shown every unmet reason with a route to fix it. 24 tests.

Also live: the admin console (§3.4) with task control, KYC review, store
approvals and disputes; wallet and payout rails (§10, escrow included); audit
logging on money movement (§16); geofenced clock-in (§11); the
`Organization` model for AZM Stores (§3.3); and the `Job`/`Candidate` module,
which is the beginning of §7's hire-through-applications.

---

## 3. Six reversals the blueprint forces (two now cost nothing)

Each of these overturns a decision taken during the build. Listed with what it
costs, cheapest first.

**Store dashboard shows held AZM inventory** (§3.3, §12 `Store.held-inventory`).
Earlier direction was that Part-Time holds no stock data. *Cost: low.* It is a
read-only mirror, and the rule from `ARCHITECTURE.md` §12 applies unchanged —
display-only, decides nothing. A stale number on a screen is harmless; one that
refuses an order is a wrong refusal nobody authorised.

**The store map lives in PartTime** (§8). Earlier reasoning put a customer-facing
map on Mart's side. The blueprint's map is *operational* — visible to Couriers
and Sourcing Agents, not shoppers — which is a different thing and belongs here.
*Cost: low-medium.* Coordinates are already stored.

**Couriers are a Tasker sub-family, not a peer account type** (§3.2). The build
has three peer `accountType` values. *Cost: medium.* Note the nuance before
ripping anything out: the blueprint still gives couriers *"its own onboarding
and its own live map view"*, so `accountType: COURIER` may survive as the
onboarding discriminator while courier-ness for **task matching** becomes a
skill role. That reading keeps today's portal intact.

**Shared identity with AZM** (§13). The portal shipped today creates its own
accounts. *Cost: medium-high.* If identity is shared, Part-Time should have a
"continue with AfriZoneMart" button and no registration form. Blocked on AZM
exposing an identity provider.

**Escrow** (§10). *Resolved at no cost* — escrow as STATE rather than custody, see §4. Mart holds the money; PartTime records the ring-fence.

**PAPSS and AfriCOIN as payment rails** (§10). *Deferred* — Nigeria-only for now, see §4.

---

## 4. Two parameters — both now decided

### Currency: Naira only

**Decided: Nigeria-only, for now.** No currency column. `Payment.amount`,
`Task.rate`, `Task.budget` and `Withdrawal.amount` stay whole-Naira integers, and
payouts stay on Paystack NUBAN transfers. Blueprint §10 names PAPSS and AfriCOIN;
neither is in scope today.

**The trigger for revisiting is precise, and it is not a date.** The currency
column has to land *before the first non-Naira row exists in production* —
afterwards means back-filling a value that was never recorded, across every money
table at once. So the moment a second country is genuinely on the table, this is
the first schema change, not a later one.

### Escrow: state, not custody

**Decided: Mart holds the money throughout. PartTime records the commitment and
releases it on verified acceptance.**

This satisfies Blueprint §10's guarantee — *"funds ring-fenced when a contract
goes live and released only on verified acceptance"* — without PartTime ever
receiving money. The worker-facing promise is identical: their pay is ring-fenced
the moment the contract goes live. What differs is that PartTime does not become a
regulated payments business, hold a float, or reconcile a balance of its own.

Four commitment states: `COMMITTED` when the contract goes live, `RELEASED` on
verified acceptance, `PAID` when Mart confirms it paid, `CANCELLED` if the
contract fails. PartTime never asserts anything was paid — only Mart knows that.
Specified in `MART_INTEGRATION.md` §7.

---

## 5. Mart integration — specified, and now built

`MART_INTEGRATION.md` was written before this blueprint and covered only
`order.confirmed`. It has been rewritten around the event bus §5 asks for, and
that bus is now live on the PartTime side — one signed endpoint at
`POST /api/integrations/mart/events`, an event ledger, and an admin screen at
Operations → Mart. Mart itself is not sending yet.

| Blueprint event | Creates | De-duplicated on |
|---|---|---|
| `order.confirmed` | Fulfilment + dispatch | `martOrderId` |
| `stock.low` | Sourcing task | `sku` + region — one open task per product per region |
| `store.applied` | Audit task | `applicationId` |
| `listing.needs_media` | Photography task | `listingId` |

Two things came out of writing it that are worth knowing here:

**Mart sends facts, not task parameters.** No pay band, no radius, no required
skill role, no deadline. Those are PartTime's Admin-editable generation rules per
§5 — putting them in Mart's payload would mean changing Mart's code to raise a
courier fee.

**Two kinds of duplicate need different answers.** `eventId` stops the same
delivery being processed twice; a per-type de-duplication rule stops duplicate
*work*. `stock.low` firing hourly while a shelf stays empty is the case that
makes the distinction obvious, and neither mechanism substitutes for the other.

D10 in that spec — who owns the store record — **is settled: PartTime owns it.**
A `store.applied` event is Mart forwarding a lead, so the handler creates the
`Organization` itself, PENDING, and raises the audit. Mart is not handing over a
business.

**Every event is recorded, including the ones nothing can act on yet.**
`order.confirmed` is answered 202 and stored DEFERRED, because delivery has no
assignment path, no pickup and drop-off and no customer OTP — there is nothing
correct to create. Answering 200 and dropping it would lose real orders; the
ledger means they can be replayed the day delivery ships. That distinction —
between "Mart never sent it", "we de-duplicated it" and "nothing is built to
handle it" — is the whole reason the ledger exists rather than a bare
idempotency key, and it is what the admin screen shows.

---

## 6. Substantial features not started

- **Ranked matching** (§11). The build gates *qualified / not qualified*; the
  blueprint wants candidates **scored** on skill, proximity, reliability and
  current load. Different problem.
- **Proof-of-work evidence** (§14). Geo-tagged photos, signatures and timestamps,
  required per task type, so verification is largely automatic.
- **Reputation tiers and badges** (§9). Note this is a *third* meaning of "tier"
  in the project — bronze/silver/gold reputation standing, distinct from both the
  work-category tiers (`STUDENT`, `DISPATCH`…) and any store tier from §14.
  Naming needs settling before it is built.
- **Surge pay, crew contracts, referral loop** (§10, §14).
- **CallyValley** as the certification feeder and **VOLTRON** as a labour
  consumer (§2). Neither system has been discussed before.
- **Offline-tolerant mobile flows** (§16). The app currently assumes
  connectivity throughout.

---

## 7. Terminology

The blueprint's vocabulary should win, and the code does not use it yet.

| Blueprint | Code today |
|---|---|
| **PartTime** | "Afrizone Part-Time" |
| **Tasker** | "Worker" / `INDIVIDUAL` |
| **AZM Store** | `Organization { kind: STORE }` |
| **Skill role** (Sourcing Agent, Auditor, Courier, Field & Media) | `Skill` + `Tier`, no role concept |
| **Contract** | Split across `Application`, `Contract` and `Task` |

Renaming is cheap in the UI and expensive in the schema. Worth doing the
user-facing strings early and leaving table names alone until there is a
migration touching them anyway.

---

## 8. What is next

Items 1-6 of the previous ordering are done: the contract state machine, D10,
two-way ratings and the store map API, commitment states, the store premises
audit, and the event bus with auto-task generation.

What remains, in the order it is worth doing:

1. **A screen for the store map.** The API returns approved stores by distance
   already; nothing renders them. It is the last Phase 1 item that needs no
   decision from anybody.
2. **Delivery**, which is the only reason `order.confirmed` sits DEFERRED. It
   needs pickup and drop-off on a task that has one location today, a work-progress
   axis distinct from the posting's status, and a customer OTP for somebody who
   has no PartTime account. Every deferred order replays the day it lands.
3. **Courier onboarding** (§3.2) — blocked on the open question of whether
   couriers are a peer account type or a Tasker sub-family.
4. **CAC verification** for stores — blocked on a provider.
5. **Ranked matching** (§11), **proof-of-work evidence** (§14), **reputation
   tiers** (§9).

Still needed from the Mart team before any of this carries real traffic:
agreement on `stockSource`, a staging environment, and the shared secret for
`MART_INBOUND_SECRET`. The endpoint refuses every request until that secret is
set, which is the intended behaviour rather than a fault to debug.
