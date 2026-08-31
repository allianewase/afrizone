# AfriZoneMart ↔ PartTime integration

**Status: both halves are built on the PartTime side and neither has been
exercised against a real Mart. Everything Mart has to do is still proposal.**

Live today: `POST /api/integrations/mart/events` with the signature scheme in §2,
the event ledger, per-type de-duplication, task generation for `stock.low`,
`store.applied` and `listing.needs_media`, and an operations screen at
Operations → Mart.

**`order.confirmed` now creates a delivery** (§3.1), which the store accepts or
refuses, which posts a credential-gated courier job when accepted, and which is
completed only against a customer code Mart verifies (§5). The outbound reports
in §4 are emitted, and the seven-day customer-data purge runs daily.

TWO ENDPOINTS ARE NEEDED FROM MART BEFORE ANY OF THAT CARRIES TRAFFIC, and until
they exist PartTime behaves as though the integration were switched off rather
than broken: `POST {MART_BASE}/parttime/events` for the reports, and `POST
{MART_BASE}/parttime/verify-delivery-otp` for the code check. With
`MART_BASE_URL` and `MART_OUTBOUND_SECRET` unset, reports are skipped and a
courier is told *we could not check this*, never *that is the wrong code* — so a
delivery can be taken and collected, and cannot be completed.

Not built: the settlement endpoint in §7. Sections marked **OPEN** are still
open, and §6 D1 — what a courier does when the verifier cannot be reached — is
now load-bearing rather than hypothetical.

The events recorded DEFERRED before delivery shipped are still in the ledger and
are still replayable. Nothing replays them automatically; that is a deliberate
choice, because a batch of week-old orders arriving at real shops at once is a
decision somebody should make rather than a side effect of a deploy.

The contract two systems have to agree before either writes code against the
other. Deliberately specific — an integration agreed in prose and discovered in
production is the expensive kind.

Aligned to **PartTime Blueprint v0.1**, §5 (auto-task generation) and §13
(integration architecture). Sections marked **OPEN** are decisions nobody has
made. They are listed rather than guessed at, because a guess written into a
spec becomes a fact nobody remembers choosing.

---

## 1. The boundary

One principle arbitrates everything below:

> **AfriZoneMart is the system of record. PartTime is the human execution layer.**

| Thing | Owner | PartTime's relationship |
|---|---|---|
| Customers and their personal data | **Mart** | Receives the minimum to execute one job, then deletes it |
| Products and stock levels | **Mart** | Never edits. May mirror for display, which decides nothing |
| Orders | **Mart** | Receives them, reports what happened |
| Money from the customer | **Mart** | **Never holds it** — see §7 |
| Taskers, Couriers and their verified profiles | **PartTime** | Owns outright |
| AZM Stores as businesses | **PartTime** | Owns membership, approval, payout details |
| What is owed, and when it is ring-fenced | **PartTime** | Computes and reports; Mart pays |
| Task and delivery execution | **PartTime** | Owns outright |

**Currency is Naira only.** Every amount on both sides is a whole-Naira integer.
There is no currency field anywhere in PartTime, deliberately — confirmed as a
Nigeria-only platform *for now*. The trigger for revisiting is precise: **before
the first non-Naira row exists in production.** Adding the column afterwards
means back-filling a value that was never recorded. Blueprint §10 names PAPSS and
AfriCOIN; when either becomes real, this is the thing to change first.

---

## 2. Transport: one event bus, not four endpoints

Blueprint §5 asks for an event bus. Mart emits facts; PartTime subscribes and
runs its own rules.

**This is the load-bearing shape of the whole integration:**

> Mart sends **what happened**. PartTime decides **what work that creates**.

Mart never sends a pay band, a search radius, a required skill role or a
deadline. Those are PartTime's task-generation rules, Admin-editable per
Blueprint §5, and putting them in Mart's payload would mean changing Mart's code
to raise a courier fee.

| Direction | Endpoint | Purpose |
|---|---|---|
| Mart → PartTime | `POST /api/integrations/mart/events` | Every inbound fact |
| PartTime → Mart | `POST {MART_BASE}/parttime/events` | Every outbound fact |
| PartTime → Mart | `POST {MART_BASE}/parttime/verify-delivery-otp` | Check a code the customer read out |
| Mart → PartTime | `GET /api/integrations/mart/settlements?period=YYYY-MM` | What PartTime says is owed |

### The envelope

```jsonc
{
  "eventId": "evt_01J8XQ2M4K",          // idempotency key for THIS delivery
  "type": "order.confirmed",
  "occurredAt": "2026-08-26T09:14:22Z",
  "data": { }                            // shape depends on type, see §3
}
```

### Signing

```
X-Afz-Timestamp: 1787730614            # unix seconds
X-Afz-Signature: <hex>                 # HMAC-SHA256(secret, "{timestamp}.{rawBody}")
```

- **The timestamp is inside the signed string**, not merely alongside it —
  otherwise it can be changed freely and buys nothing.
- **Reject a timestamp more than five minutes old.** Paystack's own scheme has no
  timestamp and is replayable; we control both ends here and should not copy that.
- **Timing-safe comparison.** A byte-by-byte `===` on an HMAC leaks its answer.
- **Separate secrets per direction** — `MART_INBOUND_SECRET`,
  `MART_OUTBOUND_SECRET`. One shared secret means a leak either side compromises
  both.
- Signed over **raw bytes**; PartTime mounts a raw body parser ahead of its JSON
  parser on this path, as it already does for Paystack.

### Two kinds of duplicate, and they need different answers

**`eventId` stops the same delivery being processed twice.** Mart will retry on a
timeout or a 500, and a retry must be free: re-sending a known `eventId` returns
**`200` with the existing result, not `409`**. A retry is the system working, and
erroring on it makes Mart's alerting fire on success. Enforced by a unique
constraint, not an application check — concurrent retries race, and only a
database can arbitrate.

**Domain keys stop duplicate *work*.** A different `eventId` can legitimately
describe a situation PartTime already has a task for — `stock.low` firing again
while the shelf is still empty is the obvious case. So each type declares a
de-duplication rule (§3) that answers "is this already being handled?" That rule
is separate from `eventId` and neither substitutes for the other.

### Response codes Mart should act on

| Code | Meaning | What Mart should do |
|---|---|---|
| `200` | Already had this event | Nothing. Not an error |
| `201` | Accepted, work created | Nothing |
| `202` | Accepted, no work created (deduplicated or no rule matched) | Nothing. Not an error |
| `400` | Payload is wrong | Do not retry. Alert — a bug in one of us |
| `401` | Signature or timestamp failed | Do not retry. Alert |
| `422` | Understood but unusable (unknown store slug) | Do not retry. Alert |
| `5xx` | Our fault | Retry with backoff — idempotency makes this safe |

---

## 3. The four events

### 3.1 `order.confirmed` → fulfilment + dispatch

```jsonc
{
  "martOrderId": "AZM-2026-0001234",
  "fulfilment": {
    "storeSlug": "ikeja-city-mart",
    "stockSource": "CONSIGNMENT"          // CONSIGNMENT | OWN_STOCK
  },
  "items": [ { "ref": "SKU-8891", "name": "Peak Milk 400g", "qty": 2 } ],
  "dropoff": {
    "address": "14 Adeniran Ogunsanya, Surulere, Lagos",
    "lat": 6.4969, "lng": 3.3540,
    "instructions": "Blue gate, second floor"
  },
  "customer": { "displayName": "Ada O.", "phone": "+2348030000123" },
  "money": { "goodsTotal": 8400, "deliveryFee": 1200 },
  "expectedBy": "2026-08-26T11:00:00Z"
}
```

**De-duplicated on `martOrderId`.** One order, one fulfilment job, forever.

**`stockSource` is the field this whole document exists for.** It carries the
money consequence and PartTime cannot infer it:

- **`CONSIGNMENT`** — the store holds Mart's stock. Fulfilling owes them nothing
  extra; the retainer already covers it. **No settlement line.**
- **`OWN_STOCK`** — the store sold its own goods. PartTime computes a settlement
  line for Mart to pay.

Absent, PartTime **rejects with `400`** rather than defaulting. A wrong default is
a store paid twice or not at all, found weeks later in reconciliation, and
reconstructing the truth from receipts is a project rather than a fix.

### 3.2 `stock.low` → sourcing task

```jsonc
{
  "sku": "SKU-8891",
  "productName": "Peak Milk 400g",
  "currentQty": 0,
  "reorderThreshold": 24,
  "targetQty": 120,
  "region": "lagos-mainland"              // whatever Mart's own zoning calls it
}
```

**De-duplicated on `sku` + region: one open sourcing task per product per region.**
Without this rule a shelf that stays empty for a day produces a task an hour.

Mart sends **no budget and no deadline.** PartTime's rules decide the pay band,
the target radius, and that a Sourcing Agent credential is required.

> **OPEN (D9) — how does Mart signal that a stock gap has closed?** If a sourcing
> task is running and the item gets restocked another way, PartTime should cancel
> rather than send someone shopping for stock that arrived. A `stock.replenished`
> event would close this cleanly.

### 3.3 `store.applied` → audit task

```jsonc
{
  "applicationId": "AZM-STORE-APP-0091",
  "businessName": "Surulere Fresh Mart",
  "address": "14 Adeniran Ogunsanya, Surulere, Lagos",
  "lat": 6.4969, "lng": 3.3540,
  "contact": { "name": "Ada Obi", "phone": "+2348030000123", "email": "ada@…" },
  "registration": { "cac": "RC1234567", "tin": "12345678-0001" }
}
```

**De-duplicated on `applicationId`.** PartTime creates an inspection task
requiring a verified Auditor credential (Blueprint §8), and reports the score
back as `store.audit.completed`.

> **OPEN (D10) — who owns the store record?** PartTime already owns
> `Organization` — membership, approval, payout details — and the admin console
> approves stores today. But §5 has applications originating at Mart. Either Mart
> owns applications and hands over an approved store, or PartTime owns the whole
> lifecycle and Mart merely forwards a lead. **Both cannot own it**, and picking
> late means reconciling two store lists.

### 3.4 `listing.needs_media` → photography task

```jsonc
{
  "listingId": "AZM-LST-4471",
  "sku": "SKU-8891",
  "productName": "Peak Milk 400g",
  "need": ["HERO", "PACK_SHOT"],
  "whereToFind": { "storeSlug": "ikeja-city-mart" }
}
```

**De-duplicated on `listingId`.** PartTime's rules decide pay and which Field &
Media credential is required. Finished media is reported back as
`listing.media.ready` with the stored asset references; **Mart remains the
product catalogue** and decides what to publish.

---

## 4. What PartTime reports back

Same envelope, opposite direction.

| Event | Means |
|---|---|
| `order.received` | Queued |
| `order.store_accepted` / `order.store_rejected` | The store can or cannot fulfil |
| `order.prepared` | Ready for collection |
| `order.courier_assigned` | A courier accepted the drop |
| `order.picked_up` | Collected from the store |
| `order.delivered` | **OTP verified**, customer has it |
| `order.delivery_failed` | Attempted, not completed |
| `sourcing.completed` / `sourcing.failed` | Stock secured, or not |
| `store.audit.completed` | Inspection done, with score and outcome |
| `listing.media.ready` | Media captured and accepted |

Rules:

- **Events are facts, not requests.** PartTime never asks permission; it reports
  what already happened.
- **Ordered, but not guaranteed in order.** Retries reorder. Treat `occurredAt`
  as authoritative and ignore an event older than the state you hold.
- **At-least-once.** Make applying one idempotent on `eventId`.
- **`order.delivered` is only ever emitted after a successful OTP verification.**
  There is no path where a courier tapping a button produces it.

---

## 5. The OTP, and data we delete

**Mart generates the code, delivers it to the customer, and verifies it.**
PartTime never stores it and never sees it except in transit.

```
POST {MART_BASE}/parttime/verify-delivery-otp
{ "martOrderId": "AZM-2026-0001234", "code": "4821" }

→ 200 { "valid": true }
→ 200 { "valid": false, "remainingAttempts": 2 }
```

This removes the hardest data problem outright: a delivery OTP belongs to a
customer with no PartTime account, and PartTime's OTP model is keyed to a user.

> **OPEN (D1) — what happens when verification cannot be reached.** A hard network
> dependency at the worst moment: a courier in a compound with one bar of signal,
> the customer waiting, Mart's API not answering. Today they cannot complete,
> cannot leave, and cannot be paid. Options: a short-lived verifier pre-fetched at
> pickup; an offline exception Mart adjudicates later; or accepting the stall and
> staffing for it.

### Customer data

Per order, PartTime receives a display name, a contact number, a drop-off address
with coordinates, and delivery instructions. That is the whole list.

- **Deleted seven days** after the order reaches a terminal state.
- **Deleted means `DELETE`** — not a flag, not a filtered query. Data still in the
  database is still a liability.
- **The purge is auditable and its failure visible.** A purge run is a recorded
  row, so a job that silently did not run is distinguishable from one that ran and
  found nothing.

> **OPEN (D2) — real phone number, or a proxy?** A courier needs to reach the
> customer, so today's assumption is a real number. A masked relay number would be
> better for Mart's data posture and would make the purge nearly moot.

---

## 6. Failure paths

None is an edge case; each is a normal Tuesday, and delivery cannot ship without
answers. **D4 is now decided and built; the rest are OPEN.**

**D3 — a store rejects an order.** Because PartTime holds no stock data, rejection
is the *only* unavailability signal. Another store, a sourcing task, or a refund?
Working assumption, consistent with §1: **Mart decides, PartTime only reports.**

**D4 — nobody accepts a delivery. SETTLED: a widening circle, then a person.**
A qualified courier may now take a delivery posting themselves rather than
waiting for an admin to approve an application — assignment by approval is right
for a week-long task and much too slow for an order that has to move within the
hour. The posting opens to couriers within **3 km** of the shop, the circle
**doubles every 5 minutes** to a **15 km** ceiling, and at **20 minutes**
unclaimed the operations board flags it for a human. Every number is a
`rules.DELIVERY.*` setting, because the right ones are an operational fact
nobody knows before the first week of real orders.

*No automatic fee increase.* Surge pricing is a real cost exposure, it belongs
to Blueprint §10, and none of it is built. Raising a fee stays a human decision.

*Escalation does not close the offer.* The board asking somebody to look and the
job still being claimable are not in tension — stopping couriers from taking an
order at the exact moment it is agreed nobody has taken it would be perverse.

*Nothing is swept or scheduled.* The radius, the stage and the escalation flag
are arithmetic on `Delivery.offeredAt`, computed when someone asks. There is no
second cron and no state that can go stale, which matters because an escalation
that quietly stops firing is an order nobody is ever told about.

*The radius belongs to the posting, not to a query over couriers.* PartTime
stores no courier location and this decision does not introduce one: a courier
says where they are when they ask what they can take, and the position is used
to answer and never written down. Pushing offers to nearby riders would need
stored live positions — a standing privacy liability and a §5-shaped retention
problem — and is a separate decision nobody has had to make yet.

Off-switch: `rules.DELIVERY.selfClaim = "off"` falls the platform back to
admin approval without a deploy. See `services/deliveryOffer.ts`.

**D5 — a courier accepts, then disappears.** Settled: a timeout re-opens it. Open:
how long, and whether the customer is told.

**D6 — a delivery is attempted and fails.** The customer was out; the courier rode
there. Paid attempt? Who decides? Is returning the goods a second paid leg?
Nothing in PartTime currently pays for work that did not complete, so this needs a
model, not just a policy.

---

## 7. Settlement — escrow as state, not custody

**Decided:** funds are ring-fenced against a contract, and **Mart holds them
throughout.** PartTime records the commitment and releases it on verified
acceptance.

This satisfies Blueprint §10's guarantee — *"funds ring-fenced when a contract
goes live and released only on verified acceptance"* — without PartTime ever
receiving money. **The worker-facing promise is identical**: their pay is
ring-fenced the moment the contract goes live. What differs is that PartTime does
not become a regulated payments business, keep a float, or reconcile a balance it
holds.

| Commitment state | Set when | Means |
|---|---|---|
| `COMMITTED` | The contract goes live | Mart is holding this amount against this contract |
| `RELEASED` | Acceptance criteria verified | PartTime says it is now payable |
| `PAID` | Mart tells us it paid | Closed |
| `CANCELLED` | Contract cancelled or failed | Nothing is owed |

PartTime reports commitments and releases as events; Mart pays and sends
`payment.settled` back so the loop closes. **PartTime never asserts anything was
paid** — only Mart knows that.

```jsonc
GET /api/integrations/mart/settlements?period=2026-08
{
  "period": "2026-08",
  "currency": "NGN",
  "lines": [
    {
      "payeeSlug": "ikeja-city-mart",
      "payeeKind": "STORE",                 // STORE | COURIER | TASKER
      "martOrderId": "AZM-2026-0001234",
      "basis": "OWN_STOCK",                 // CONSIGNMENT lines are not emitted
      "gross": 8400, "platformFee": 840, "net": 7560,
      "state": "RELEASED"
    }
  ],
  "totals": { "gross": 8400, "platformFee": 840, "net": 7560 }
}
```

- **Consignment orders produce no line.** Already covered by the retainer, and
  emitting a zero line invites someone to pay it.
- **Tasker and Courier pay uses the existing worker payment path**, where 5%
  withholding tax is deducted at source. **Store settlement does not** — a store
  selling goods is not earning wages, and withholding from it would be wrong.

> **OPEN (D7) — refunds landing after a period closed.** A clawback against a
> later statement, or a restatement of the closed one? Picking neither is how
> ledgers rot.

> **OPEN (D8) — retainer mechanics.** Monthly, and therefore one of two things
> requiring a scheduled job. A skipped month must show as skipped rather than
> absent — so a retainer period is a row with a status, created whether or not it
> paid.

---

## 8. What PartTime needs from Mart to start

1. **Agreement on `stockSource`**, and confirmation Mart can populate it on every
   order. Nothing else matters if that field cannot be produced.
2. **Agreement that Mart sends facts, not task parameters** (§2). No pay bands, no
   radii, no deadlines.
3. **A base URL and a staging environment.**
4. **Two shared secrets**, exchanged out of band, one per direction.
5. **Answers to D1–D10.** Not polish — these are the states the system lives in.
6. **One real-shaped sample of each of the four events.**

## 9. What PartTime commits to

1. Idempotent intake on `eventId`, plus a declared de-duplication rule per event
   type, from the first commit.
2. Signed, timestamped, replay-resistant requests in both directions.
3. Never storing a payment instrument, a full customer profile, or an OTP.
4. Deleting customer data seven days after a job is done, verifiably.
5. Never emitting `order.delivered` without a successful OTP verification.
6. **Never holding money.**
