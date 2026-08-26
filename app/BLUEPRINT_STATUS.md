# PartTime Blueprint v0.1 — where the build actually stands

The blueprint is the governing specification. This file reconciles it against
what exists, so nobody has to read 16 sections and 30 tables side by side to find
out what is done.

**Headline: of the ten things Blueprint §15 lists for Phase 1, three are
finished, four are partial, and three have not started.** The pieces that are
finished are not the easy ones — KYC, the wallet, and qualification gating are
all live.

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
| Store sign-up & KYC | **Partial** | `Organization`, membership, admin approval and a `tin` field are live. No CAC verification, and **no premises audit task** (Blueprint §8) |
| Manual task creation | **Built** | Two-step admin form with a live qualifying-worker count |
| Basic auto task creation | **Not started** | Requires the AZM event bus (§5). Nothing subscribes to anything yet |
| Contract lifecycle | **Partial** | `Contract` exists with a typed-name signature and a tamper hash — but **two states**, against the blueprint's eleven |
| Wallet | **Built** | Derived balance, withdrawals, Paystack transfers, webhook settlement |
| Escrow | **Not started** | Design settled (state, not custody). No model yet — see §4 |
| Map of approved stores | **Not started** | `lat`/`lng` are stored on every `Organization`; nothing renders them |
| Two-way ratings | **Partial** | `Rating` runs one way only — `workerId` is always the subject. A Tasker cannot rate the experience |

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
approvals and disputes; wallet and payout rails (§10, minus escrow); audit
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

## 5. Mart integration spec — now covers all four events

`MART_INTEGRATION.md` was written before this blueprint and covered only
`order.confirmed`. It has been rewritten around the event bus §5 asks for:

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

One new conflict surfaced (D10 in that spec): **PartTime already owns
`Organization` and approves stores, but §5 has store applications originating at
Mart.** Both cannot own the store record, and picking late means reconciling two
store lists.

---

## 6. Substantial features not started

- **The task state machine** (§4.2). Eleven states with defined transitions
  against today's four. Payment, disputes and analytics are all meant to hang off
  clean transitions, so this is foundational rather than cosmetic.
- **Ranked matching** (§11). The build gates *qualified / not qualified*; the
  blueprint wants candidates **scored** on skill, proximity, reliability and
  current load. Different problem.
- **Proof-of-work evidence** (§14). Geo-tagged photos, signatures and timestamps,
  required per task type, so verification is largely automatic.
- **Reputation tiers and badges** (§9). Note this is a *third* meaning of "tier"
  in the project — bronze/silver/gold reputation standing, distinct from both the
  work-category tiers (`STUDENT`, `DISPATCH`…) and any store tier from §14.
  Naming needs settling before it is built.
- **Escrow, surge pay, crew contracts, referral loop** (§10, §14).
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

## 8. Suggested order

Both blocking parameters are answered, so the money layer is no longer frozen.

1. **The task state machine** (§4.2). Eleven states against today's four, and
   everything downstream — payment, disputes, analytics — is meant to hang off
   clean transitions. Cheapest now, before production task data exists.
2. **Settle D10** — whether Mart or PartTime owns the store record. It is a
   one-word answer that decides whether store onboarding gets rebuilt.
3. **Two-way ratings and the store map.** Both small, both close Phase 1 items.
4. **Commitment states for escrow-as-state** (§4). Small, and it unblocks
   anything that talks about money being ring-fenced.
5. **Store premises audit** (§8) — completes store onboarding, and is itself a
   task, so it exercises the state machine on something real.
6. **Event bus and auto-task generation** (§5), once Mart is ready.

Still needed from the Mart team before 6: agreement on `stockSource`, a staging
environment, two shared secrets, and answers to D1–D10.
