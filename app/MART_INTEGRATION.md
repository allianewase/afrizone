# AfriZoneMart ↔ Part-Time integration

**Status: proposal. Not implemented. Nothing in this document is built yet.**

This is the contract two systems have to agree on before either writes code against
the other. It is deliberately specific — an integration agreed in prose and
discovered in production is the expensive kind.

Sections marked **OPEN** are decisions nobody has made yet. They are listed rather
than guessed at, because a guess written in a spec becomes a fact nobody remembers
choosing.

---

## 1. The boundary

One principle arbitrates every question below:

> **AfriZoneMart is the system of record. Part-Time is the operational execution
> system.**

Anything that makes Part-Time a second copy of Mart is wrong by default, even when
it looks convenient.

| Thing | Owner | Part-Time's relationship to it |
|---|---|---|
| Customers, and all their personal data | **Mart** | Receives the minimum needed to execute one delivery, and deletes it |
| Products and stock levels | **Mart** | Never edits. May display a mirror, which decides nothing |
| Orders | **Mart** | Receives them, reports what happened to them |
| Money from the customer | **Mart** | Never touches it |
| What is owed to a store or courier | **Part-Time** | Computes and reports it; **Mart pays it** |
| Delivery OTP | **Mart** | Asks Mart to verify a code; never stores one |
| Stores and courier companies as businesses | **Part-Time** | Owns membership, approval, payout details |
| Task and delivery execution | **Part-Time** | Owns it outright |

Two consequences worth stating plainly, because they are the ones that get eroded:

- **No money moves through Part-Time.** Part-Time produces a statement of what is
  owed. Mart pays it. This is the difference between a ledger and a payments
  system, and it is why Part-Time can be wrong without being dangerous.
- **Part-Time cannot be the place a customer is looked up.** If a support question
  needs the customer's history, it is answered in Mart.

---

## 2. Transport and authentication

### Direction and endpoints

Mart pushes; Part-Time reports back.

| Direction | Endpoint | Purpose |
|---|---|---|
| Mart → Part-Time | `POST https://api.parttime.afrizonemart.com/api/integrations/mart/orders` | An order that needs fulfilling or delivering |
| Mart → Part-Time | `POST /api/integrations/mart/orders/:martOrderId/cancel` | The customer cancelled, or Mart is pulling it back |
| Part-Time → Mart | `POST {MART_BASE}/partime/order-events` | Something happened to an order |
| Part-Time → Mart | `POST {MART_BASE}/partime/verify-delivery-otp` | Check a code the customer just read out |
| Mart → Part-Time | `GET /api/integrations/mart/settlements?period=YYYY-MM` | What Part-Time says is owed |

### Signing

Both directions use the same scheme. Part-Time already runs this pattern for
Paystack and Smile Identity, so it is proven here rather than novel.

```
X-Afz-Timestamp: 1787730614      # unix seconds
X-Afz-Signature: <hex>           # HMAC-SHA256( secret, "{timestamp}.{rawBody}" )
```

- **HMAC-SHA256 over `timestamp + "." + raw request body`.** The timestamp is
  inside the signed string, not merely alongside it — otherwise it can be changed
  freely and buys nothing.
- **Reject a timestamp more than 5 minutes from now.** Paystack's own scheme has no
  timestamp and is therefore replayable; we control both ends here and should not
  copy that.
- **Timing-safe comparison.** A byte-by-byte `===` on an HMAC leaks its own answer.
- Separate secrets per direction: `MART_INBOUND_SECRET`, `MART_OUTBOUND_SECRET`.
  One shared secret means a leak in either system compromises both directions.
- Signature is computed over the **raw bytes**. Part-Time mounts a raw body parser
  on this path ahead of the JSON parser, as it already does for Paystack.

### Retries and idempotency

**`martOrderId` is the idempotency key and it is not optional.** Mart will retry —
on a timeout, on a 500, on a deploy that killed an in-flight request — and a retry
must be free.

- Re-sending an order Part-Time already has returns **`200` with the existing
  record**, not `409`. A retry is a success, not a conflict; treating it as an error
  means Mart's alerting fires for the system working correctly.
- Part-Time enforces this with a unique constraint, not an application check.
  Two concurrent retries race, and only a database can arbitrate that.
- **This has to exist in the first commit that accepts orders.** Adding it after
  duplicates are in production means reconciling them by hand.

### Response codes Mart should act on

| Code | Meaning | What Mart should do |
|---|---|---|
| `200` | Already had it | Nothing. Not an error |
| `201` | Accepted | Nothing |
| `400` | Payload is wrong | Do not retry. Alert — this is a bug in one of us |
| `401` | Signature or timestamp failed | Do not retry. Alert |
| `409` | Business refusal, e.g. store is suspended | Do not retry. Re-route per §6 |
| `422` | Understood but unfulfillable, e.g. unknown store slug | Do not retry. Alert |
| `5xx` | Our fault | Retry with backoff. Idempotency makes this safe |

---

## 3. Mart → Part-Time: the order push

```jsonc
{
  "martOrderId": "AZM-2026-0001234",        // idempotency key, unique forever
  "placedAt": "2026-08-26T09:14:22Z",

  "fulfilment": {
    "mode": "STORE",                        // STORE | SOURCING
    "storeSlug": "ikeja-city-mart",         // slug, not our internal id
    "stockSource": "CONSIGNMENT"            // CONSIGNMENT | OWN_STOCK — see below
  },

  "items": [
    { "ref": "SKU-8891", "name": "Peak Milk 400g", "qty": 2 }
  ],

  "dropoff": {
    "address": "14 Adeniran Ogunsanya, Surulere, Lagos",
    "lat": 6.4969,
    "lng": 3.3540,
    "instructions": "Blue gate, second floor"
  },

  "customer": {
    "displayName": "Ada O.",                // NOT the full legal name
    "phone": "+2348030000123"               // see §5 — OPEN
  },

  "money": {
    "currency": "NGN",
    "goodsTotal": 8400,                     // whole Naira integers, never decimals
    "deliveryFee": 1200
  },

  "expectedBy": "2026-08-26T11:00:00Z"
}
```

### `stockSource` is the field this whole document exists for

It carries the money consequence, and Part-Time **cannot infer it**:

- **`CONSIGNMENT`** — the store is holding Mart's stock. Fulfilling owes the store
  nothing extra; the retainer already covers it. Part-Time creates **no settlement
  line**.
- **`OWN_STOCK`** — the store sold its own goods. Part-Time computes a settlement
  line for Mart to pay.

If this is absent, Part-Time must **reject the order with `400`** rather than pick a
default. A wrong default here is either a store paid twice or a store not paid at
all, discovered weeks later during reconciliation, and reconstructing the truth from
receipts is a project rather than a fix.

### Field notes

- **`storeSlug`, not an internal id.** Slugs are stable across both systems and
  survive a re-import; internal ids are ours and should not leak into Mart's data.
- **`items` carries only what a human needs to pick and hand over.** No prices, no
  catalogue metadata, no images. Part-Time is not a product database.
- **Money is whole-Naira integers**, matching the rest of the platform. Never
  floats — `0.1 + 0.2` is a bug waiting for the first ₦-and-kobo total.
- **`mode: "SOURCING"`** is specified here for completeness but is **parked** —
  sourcing is not being built yet, and its money flow (who fronts the purchase) is
  an open product decision.
- **No payment instrument, ever.** Not a card, not a token, not a last-four.
  Part-Time has no reason to hold one and every reason not to.

---

## 4. Part-Time → Mart: what we report back

One endpoint, one event envelope:

```jsonc
{
  "martOrderId": "AZM-2026-0001234",
  "event": "PICKED_UP",
  "at": "2026-08-26T10:02:11Z",
  "detail": { }                             // event-specific, optional
}
```

| Event | Means | `detail` |
|---|---|---|
| `RECEIVED` | We have it and it is queued | — |
| `STORE_ACCEPTED` | The store confirmed it can fulfil | — |
| `STORE_REJECTED` | The store cannot fulfil it | `{ reason }` |
| `PREPARED` | Ready for collection | — |
| `COURIER_ASSIGNED` | A courier accepted the drop | `{ courierName, phone }` |
| `PICKED_UP` | Collected from the store | — |
| `DELIVERED` | OTP verified, customer has it | `{ verifiedAt }` |
| `DELIVERY_FAILED` | Attempted, not completed | `{ reason }` |
| `CANCELLED` | Pulled back before completion | `{ by, reason }` |

Rules:

- **Events are facts, not requests.** Part-Time never asks Mart's permission; it
  reports what already happened.
- **Ordered, but not guaranteed in order.** Network retries reorder things. Mart
  should treat `at` as authoritative and ignore an event older than the state it
  already holds.
- **At-least-once.** The same event may arrive twice. Mart should make applying one
  idempotent, keyed on `(martOrderId, event, at)`.
- **`DELIVERED` is only ever emitted after an OTP verification succeeded.** There is
  no path where a courier tapping a button produces this event. See §5.

---

## 5. The customer, the OTP, and data we delete

### OTP

**Mart generates the code, delivers it to the customer, and verifies it.** Part-Time
never stores it and never sees it except in transit.

```
POST {MART_BASE}/partime/verify-delivery-otp
{ "martOrderId": "AZM-2026-0001234", "code": "4821" }

→ 200 { "valid": true }
→ 200 { "valid": false, "remainingAttempts": 2 }
```

This design removes the hardest PII problem outright: a delivery OTP belongs to a
customer with no Part-Time account, and Part-Time's existing OTP model is keyed to a
`User`. Keeping it on Mart's side avoids inventing a shadow customer record.

**OPEN — the failure at the door.** This puts a hard network dependency at the worst
possible moment: a courier standing in a compound with one bar of signal, the
customer waiting, Mart's API not answering. Right now the courier cannot complete,
cannot leave, and cannot be paid. This needs a decided answer before launch. Options
worth weighing: a short-lived pre-fetched verifier issued at pickup; an offline
exception the courier records and Mart adjudicates later; or accepting the stall and
staffing for it.

### Customer data

Part-Time receives, per order: a display name, a contact number, a drop-off address
with coordinates, and delivery instructions. That is the whole list.

- **Retention: deleted 7 days after the order reaches a terminal state**
  (`DELIVERED`, `CANCELLED`, or a closed `DELIVERY_FAILED`).
- **Deleted means `DELETE`.** Not a flag, not a filtered query. Data still in the
  database is still a liability, and "we stopped showing it" is not a deletion.
- The purge must be **auditable and its failure visible**: a purge run is a recorded
  row, so a job that silently did not run is distinguishable from one that ran and
  found nothing. Part-Time deliberately has no scheduled jobs today, and this is one
  of the two things that will introduce the first — it should arrive with that
  property from the start.

**OPEN — real phone number, or a proxy?** A courier genuinely needs to reach the
customer, so today's assumption is that a real number crosses the boundary. A
masked relay number would be strictly better for Mart's data posture and would make
the 7-day purge nearly moot. Whether Mart can issue one is a Mart question.

---

## 6. Failure paths that need decisions

These are not edge cases; each is a normal Tuesday. **All are OPEN.**

**A store rejects an order.** Because Part-Time holds no stock data, a rejection is
the *only* signal that something is unavailable. Who re-routes — does Mart pick
another store, does it become a sourcing task, or is the customer refunded? Working
assumption, consistent with §1: **Mart decides, Part-Time only reports the
rejection.** Needs confirming rather than assuming.

**Nobody accepts a delivery.** A drop sits unclaimed. How long before it escalates,
and to what — a wider radius, a higher fee, a human, back to Mart?

**A courier accepts and then disappears.** Decided: a timeout re-opens it. The
duration is not decided, and neither is whether the customer is told.

**A delivery is attempted and fails.** The customer was out. The courier rode there.
Is that a paid attempt, who decides, and is returning the goods to the store a
second paid leg? Nothing in Part-Time currently pays for work that did not complete,
so this needs a model, not just a policy.

---

## 7. Settlement

Part-Time computes; Mart pays. Mart pulls a statement:

```
GET /api/integrations/mart/settlements?period=2026-08
```

```jsonc
{
  "period": "2026-08",
  "currency": "NGN",
  "lines": [
    {
      "organizationSlug": "ikeja-city-mart",
      "kind": "STORE",
      "martOrderId": "AZM-2026-0001234",
      "basis": "OWN_STOCK",                 // CONSIGNMENT lines are not emitted
      "gross": 8400,
      "platformFee": 840,
      "net": 7560
    }
  ],
  "totals": { "gross": 8400, "platformFee": 840, "net": 7560 }
}
```

- **Consignment orders produce no line at all.** They are already covered by the
  retainer, and emitting a zero line invites someone to pay it.
- Part-Time reports **what it believes is owed**. It never asserts anything was
  paid. If Mart wants paid-state reflected back, that is a separate event Mart
  sends us.
- **OPEN — refunds after settlement.** A refund landing after a period closed means
  a clawback against a later statement, or a restatement of the closed one. Both are
  defensible; picking neither is how ledgers rot.
- **OPEN — the retainer.** Monthly, and therefore the second thing requiring a
  scheduled job. A skipped month must show as skipped rather than as absent, which
  means a retainer period is a row with a status, created whether or not it paid.

---

## 8. What Part-Time needs from Mart to start

1. **Agreement on `stockSource`**, and confirmation Mart can populate it on every
   order. Nothing else in this document matters if that field cannot be produced.
2. **A base URL and a staging environment** to call for events and OTP verification.
3. **Two shared secrets**, exchanged out of band, one per direction.
4. **A decision on the customer phone number**: real, or a proxy Mart issues.
5. **Answers to §6.** Delivery cannot ship without them — they are not polish, they
   are the states the system spends its time in.
6. **A sample order**, real-shaped, so both sides can test against something other
   than an example in a document.

## 9. What Part-Time commits to

1. Idempotent order intake, unique on `martOrderId`, from the first commit.
2. Signed, timestamped, replay-resistant requests in both directions.
3. Never storing a payment instrument, a full customer profile, or an OTP.
4. Deleting customer data 7 days after an order is done, verifiably.
5. Never emitting `DELIVERED` without a successful OTP verification.
6. Never moving money.
