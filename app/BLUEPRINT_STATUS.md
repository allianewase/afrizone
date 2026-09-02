# PartTime Blueprint v0.1 — where the build actually stands

The blueprint is the governing specification. This file reconciles it against
what exists, so nobody has to read 16 sections and 30 tables side by side to find
out what is done.

**Headline: every one of the ten things Blueprint §15 lists for Phase 1 is
built, and delivery — the first item of Phase 2 — is built end to end.** What
remains is self-claim, ranked matching, evidence capture and the rest of §14, and
the operational work of switching Mart on.

Three things are built to a deliberate limit, and pretending otherwise would be
the more expensive mistake: **CAC verification is a manual check** until a
registry provider is configured, **the store map is an admin screen** — couriers
see the network through the API, not a map on their phone — and **a delivery
cannot be completed until Mart exposes its code-verification endpoint**, because
no courier tapping a button is allowed to produce a delivered order.

Living document. When it stops matching the code, the code is right.

---

## 1. Phase 1 (MVP), item by item

Blueprint §15 defines Phase 1 as: *Tasker + Courier + Store sign-up & KYC;
manual + basic auto task creation; contract lifecycle; wallet & escrow; map of
approved stores; two-way ratings.*

| Phase 1 item | Status | Where it stands |
|---|---|---|
| Tasker sign-up & KYC | **Built** | Phone-OTP and email sign-up, an 8-step KYC stepper, document upload to R2, Smile Identity when configured, manual admin review otherwise |
| Courier sign-up & KYC | **Built** | A readiness checklist in both the portal and the app, `CourierProfile` for the vehicle and plate, and `Vehicle insurance` as the third credential type. What is asked for follows the vehicle: nobody on foot is asked for a licence |
| Store sign-up & KYC | **Built** | `Organization`, membership, admin approval, `tin`, a premises audit raised as gated paid work (§8), and CAC registration with a four-state review. The registry lookup is env-gated: with no provider, it is a manual check and the screen says so |
| Manual task creation | **Built** | Two-step admin form with a live qualifying-worker count |
| Basic auto task creation | **Built** | One signed inbound endpoint, an event ledger, per-type de-duplication, and admin-editable generation rules. All four event types now generate; `order.confirmed` creates a delivery the store answers for |
| Contract lifecycle | **Built** | An explicit state machine — nine states and a table of legal moves, against the two it had. The blueprint names eleven; the two absent are stages this build reaches through the task, not the contract |
| Wallet | **Built** | Derived balance, withdrawals, Paystack transfers, webhook settlement |
| Escrow | **Built** | `Commitment` records the ring-fence — COMMITTED on a live contract, RELEASED on verified acceptance. Mart holds the money throughout; see §4 |
| Map of approved stores | **Built** | People → Network: a real basemap, pins by kind, click-anywhere to measure, and a count of approved businesses the map cannot show because nobody set their coordinates. Admin-facing; a courier's in-app map is delivery work, not this |
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
has three peer `accountType` values. *Cost: medium, and lower than it was.* The
courier onboarding built since keeps both readings open on purpose: it uses
`accountType: COURIER` only to decide who is SHOWN the setup screen, and what a
courier may actually do is decided by credentials through the eligibility
engine - which is account-type agnostic. So making courier-ness a skill role
later changes who sees a menu row, not who can work.

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

**Every event is recorded, including the ones nothing could act on.**
`order.confirmed` was answered 202 and stored DEFERRED for as long as delivery
did not exist, because there was nothing correct to create. Answering 200 and
dropping it would have lost real orders. It now creates a delivery — see §6 —
and the events banked under DEFERRED are still there and still replayable.
Nothing replays them automatically, deliberately: a batch of week-old orders
landing at real shops at once is a decision somebody makes, not a side effect of
a deploy. The distinction the ledger exists for — between "Mart never sent it",
"we de-duplicated it" and "we could not place it" — is what the admin screen
shows, and it is why this is a ledger rather than a bare idempotency key.

---

## 6. Delivery — built, and unexercised against a real Mart

The first item of Phase 2, and the reason `order.confirmed` sat DEFERRED. Three
things were missing and all three now exist.

**A second location.** A task has one site; a delivery has a shop to collect from
and a door to knock on, and the distance between them is the work. The new
`Delivery` table holds both. The pickup is **copied** from the store rather than
joined to it, so a shop that moves or is renamed does not rewrite where
deliveries already made actually went.

**A progress axis that is not the courier's.** This is the decision worth
understanding before changing anything: there are now three status axes.
`Task.status` is the posting. `Contract.status` is one person's engagement with
it. `Delivery.status` is the ORDER, and it has to be separate because "the store
has not accepted this yet" is a state that exists before any courier does and can
end the order without one. Collapsing it into the courier's work lifecycle makes
*did the rider fail, or did the store refuse?* unanswerable, and those need
different people to act on them.

Packing is a **timestamp, not a state**, for the same reason `Contract.signedAt`
is one: a courier may well accept the job while the shopkeeper is still bagging
it, and a state would force an order through a sequence real shops do not
respect.

**A customer OTP for somebody with no PartTime account.** Mart generates the
code, delivers it and verifies it; PartTime never stores it and never sees it
except in transit. That removes the problem outright rather than solving it —
PartTime's own `OtpCode` model is keyed to a user, and a delivery customer has no
user.

What the flow is: Mart confirms an order → the store accepts or refuses it → an
acceptance posts a credential-gated courier job through the same generator every
other automatic task uses → a courier claims it, or an admin approves an
application, and the same code assigns them either way → the courier collects →
the courier enters the customer's code, Mart verifies it, and only then is it
delivered.

All three parties have a screen. A store answers its inbox in the portal; a
courier works their jobs in the portal and in the app, where live deliveries also
appear on the home screen because an order is the only work on this platform with
somebody standing in a doorway; operations watches a board at Operations →
Deliveries that says *who each order is waiting on* rather than only what state
it is in.

**A courier can take a delivery without waiting for anybody.** An accepted order
is offered inside a circle around the shop that widens on a timer — three
kilometres at first, doubling every five minutes to a fifteen-kilometre ceiling —
and any qualified courier standing inside it can claim it from the app. There is
still only one assignment path: self-claim and admin approval both run
`assignWorker()`, so the two can never disagree about who holds a job, and a
claim takes the posting with a conditional update, so two couriers tapping at
once produce one contract and one refusal.

Nothing about a courier's position is stored. The app sends a location with the
request and the platform forgets it, which is why the radius belongs to the
posting rather than to a query over couriers. If an order is still unclaimed
after twenty minutes it is flagged for a person on the operations board — the fee
never moves on its own, and the order stays claimable while it is flagged. Every
number is a Setting an admin edits at Mart → Delivery offer, and
`rules.DELIVERY.selfClaim = "off"` puts assignment back to approval only.

One thing is deliberately absent:

- **A delivery cannot complete until Mart exposes two endpoints.** Unconfigured,
  a courier is told *we could not check this* — never *that is the wrong code*,
  which would have them arguing with a customer about a check that never ran. The
  operations board says so at the top of the page, so an order that will not
  complete is not mistaken for a courier who has not turned up.

`MART_INTEGRATION.md` §6 D1 and D6 are open and now matter: what a courier does
when the verifier cannot be reached, and whether a failed attempt is paid. D4 —
how long an unclaimed delivery waits — is settled and built, above. D5 — a
courier who vanishes — is half-settled: an operator re-opens the posting from
the board, and how long that should take before somebody notices is still open.

**Customer data is deleted seven days after an order finishes**, per §5 — the
name, the number, the door, the coordinates and the instructions, actually
emptied rather than flagged. This is the platform's only scheduled job, and it
exists because absence of data is the one thing that cannot be derived at read
time the way expired postings and credentials are. Every run writes an audit row
including a run that finds nothing, so a cron that stopped firing is
distinguishable from a quiet week.

---

## 7. Substantial features not started

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

## 8. Terminology

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

## 9. What is next

**Phase 1 is complete, delivery is built end to end, and a courier can claim an
order themselves.** Everything below is in the order it is worth doing:

1. **Ranked matching** (§11). The build gates qualified / not qualified; the
   blueprint wants candidates scored on skill, proximity, reliability and load.
   The delivery offer answers a crude version of proximity — inside the circle or
   not — and nothing orders the couriers inside it. "Who is nearest and free?" is
   the question an order asks, and it is still first-come.
2. **Proof-of-work evidence** (§14) — geo-tagged photos, signatures, timestamps,
   required per task type, so verification is largely automatic.
3. **Reputation tiers and badges** (§9). Note this is a *third* meaning of
   "tier"; the naming needs settling before it is built.
4. **Surge pay, crew contracts, referral loop** (§10, §14), **shared identity
   with AZM** (§13, blocked on Mart exposing an identity provider), and
   **offline-tolerant mobile flows** (§16).

Three things have a deliberate ceiling worth revisiting when there is a reason:

- **CAC verification is manual** until `CAC_LOOKUP_URL` and `CAC_API_KEY` are
  set. The lookup and the name comparison are built and dormant.
- **The store map is admin-only.** A courier's in-app map needs a native map
  component and a rebuild. The delivery screens shipped without one, which means
  a rider is given an address and a phone number and left to find the door — the
  hard half, on their own. That is the most obvious gap in what was just built.
- **A delivery cannot be completed** until `MART_BASE_URL` and
  `MART_OUTBOUND_SECRET` are set and Mart exposes the code check. Built and
  dormant, the same way the CAC lookup is.

Still needed from the Mart team before any of this carries real traffic:
agreement on `stockSource`, a staging environment, the shared secret for
`MART_INBOUND_SECRET`, and now the two outbound endpoints in
`MART_INTEGRATION.md` §4 and §5 with a secret of their own. Every one of those
refusals is the intended behaviour rather than a fault to debug.
