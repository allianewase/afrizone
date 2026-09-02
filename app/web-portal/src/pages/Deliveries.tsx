/**
 * Orders, from the two sides that touch one in the portal.
 *
 * A STORE sees an inbox and answers it. A COURIER sees the jobs they are
 * carrying and works them. They are the same order and the same endpoints; what
 * differs is which questions each is being asked.
 *
 * NEITHER SIDE DECIDES WHAT IT MAY SEE. Every field here arrives already scoped
 * by the server - a store gets its own orders, a courier gets the ones they hold
 * a contract on. Nothing below filters anything for privacy, because a client
 * that hides a field has still received it.
 *
 * THE COMPLETION CODE IS THE CAREFUL PART. Three outcomes, not two: the code was
 * right, the code was wrong, or we could not ask. A courier told the customer
 * typed it wrong, when in fact nothing was checked, argues on a doorstep about
 * something that never happened - so the unreachable case is worded as ours to
 * fix and says not to leave the goods.
 */
import { useEffect, useState } from 'react'
import { ErrorNote } from './Shell'
import { api, ApiError } from '../lib/api'
import type { Delivery, DeliveryStatus } from '../lib/types'
import { directionsUrl, type Place } from '../lib/directions'
import { useArrivals, useLive, useOverlay } from '../lib/useLive'

/** Whole Naira everywhere - there is no currency field in this platform. */
function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG')}`
}

function when(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * How long until it is due, or how long ago it was.
 *
 * A clock time alone makes a shopkeeper do arithmetic to answer the only
 * question they have - is this late? Returns null past a day, where the
 * relative form stops being useful and the date is the better answer.
 */
function relative(iso: string | null): string | null {
  if (!iso) return null
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000)
  const abs = Math.abs(mins)
  if (abs > 60 * 24) return null
  const span = abs < 60 ? `${abs} min` : `${Math.round(abs / 60)} hr`
  return mins >= 0 ? `in ${span}` : `${span} ago`
}

/** Live orders first, finished ones after, newest within each. */
const LIVE: DeliveryStatus[] = ['RECEIVED', 'STORE_ACCEPTED', 'COURIER_ASSIGNED', 'PICKED_UP']
function byUrgency(a: Delivery, b: Delivery): number {
  const liveA = LIVE.includes(a.status) ? 0 : 1
  const liveB = LIVE.includes(b.status) ? 0 : 1
  if (liveA !== liveB) return liveA - liveB
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

/**
 * Renders nothing when there is nowhere to point.
 *
 * A store whose owner never set coordinates is a real row - the admin network
 * map counts them - and a dead "Directions" link is worse than none to somebody
 * standing on a kerb deciding which way to ride.
 */
function Directions({ to, label }: { to: Place; label: string }) {
  const href = directionsUrl(to)
  if (!href) return null
  return (
    <>
      <br />
      <a href={href} target="_blank" rel="noreferrer">
        {label} &rarr;
      </a>
    </>
  )
}

const PILL: Record<DeliveryStatus, string> = {
  RECEIVED: 'wait',
  STORE_ACCEPTED: 'wait',
  COURIER_ASSIGNED: 'wait',
  PICKED_UP: 'wait',
  DELIVERED: 'ok',
  STORE_REJECTED: 'bad',
  FAILED: 'bad',
  CANCELLED: 'bad',
}

/**
 * The line items, as Mart sent them.
 *
 * A LIST, NOT A SENTENCE. These were joined with commas, which reads fine for
 * two items and becomes unusable at six - and this is literally the packing
 * list somebody works down while filling a bag. The quantity leads each line
 * for the same reason: it is the number they are counting out.
 */
function Items({ d }: { d: Delivery }) {
  if (d.items.length === 0) return <span className="muted">No items listed</span>
  return (
    <ul className="items">
      {d.items.map((i, n) => (
        <li key={n}>
          <span className="qty">{i.qty ?? 1}</span>
          {i.name ?? i.ref ?? 'Item'}
        </li>
      ))}
    </ul>
  )
}

/** What the order is, in the words of the thing being carried. */
function summarise(d: Delivery): string {
  if (d.items.length === 0) return 'Order'
  const first = d.items[0]
  const name = first.name ?? first.ref ?? 'Item'
  const rest = d.items.length - 1
  return rest > 0 ? `${name} and ${rest} more` : name
}

// ── The store ────────────────────────────────────────────────────────────────

/**
 * One order in the store's inbox.
 *
 * A NEW ORDER OFFERS EXACTLY TWO ANSWERS, and refusing needs a reason typed
 * out. PartTime holds no stock data, so a store saying no is the only
 * unavailability signal AfriZoneMart ever gets - "no" on its own tells them
 * nothing they can act on.
 */
function StoreOrderCard({ d, onChange }: { d: Delivery; onChange: (next: Delivery) => void }) {
  const [busy, setBusy] = useState<'accept' | 'reject' | 'prepared' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  async function run(what: 'accept' | 'reject' | 'prepared') {
    setBusy(what)
    setError(null)
    setWarning(null)
    try {
      const next =
        what === 'accept'
          ? await api.acceptDelivery(d.id)
          : what === 'reject'
            ? await api.rejectDelivery(d.id, reason.trim())
            : await api.markPrepared(d.id)
      // An accepted order with no courier job behind it looks exactly like a
      // delivery nobody wanted, so the server says so and the store is told.
      if (next.warning) setWarning(next.warning)
      onChange(next)
      setRejecting(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not do that.')
    } finally {
      setBusy(null)
    }
  }

  return (
    // An order awaiting a decision is marked, because in a list of eight it is
    // the only one that needs a person. Everything else is there to be read.
    <div className={`card ord${d.status === 'RECEIVED' ? ' needs-you' : ''}`}>
      <div className="ord-head">
        <div className="ord-title">
          <b>{summarise(d)}</b>
          <span className="ord-ref">
            {d.martOrderId} &middot; {relative(d.createdAt) ?? when(d.createdAt)}
          </span>
        </div>
        <div className="ord-pills">
          <span className={`pill ${PILL[d.status]}`}>{d.statusLabel}</span>
          {d.preparedAt && d.status === 'STORE_ACCEPTED' && (
            <span className="pill ok">Packed</span>
          )}
        </div>
      </div>

      <div className="rows" style={{ marginTop: 10 }}>
        <div className="row">
          <span className="row-l">Items</span>
          <span className="row-v"><Items d={d} /></span>
        </div>
        <div className="row">
          <span className="row-l">Goods</span>
          <span className="row-v"><b className="money">{naira(d.goodsTotal)}</b></span>
        </div>
        <div className="row">
          <span className="row-l">Deliver to</span>
          <span className="row-v">
            {d.customerPurged ? (
              // §5: we said we would delete this seven days after the order
              // finished, and we did. Saying so is not the same as an empty row.
              <span className="muted">Removed, as promised, seven days after this order finished</span>
            ) : (
              <>
                {d.dropoffAddress ?? '—'}
                {d.dropoffInstructions ? <><br /><span className="muted">{d.dropoffInstructions}</span></> : null}
              </>
            )}
          </span>
        </div>
        {d.expectedBy && (
          <div className="row">
            <span className="row-l">Expected by</span>
            <span className="row-v">
              {when(d.expectedBy)}
              {relative(d.expectedBy) && (
                <span className="muted"> &middot; {relative(d.expectedBy)}</span>
              )}
            </span>
          </div>
        )}
        {d.storeNote && (
          <div className="row">
            <span className="row-l">You said</span>
            <span className="row-v">{d.storeNote}</span>
          </div>
        )}
      </div>

      {error && <ErrorNote message={error} />}
      {warning && <div className="note" style={{ marginTop: 10 }}>{warning}</div>}

      {d.status === 'RECEIVED' && !rejecting && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button className="btn inline"  disabled={busy !== null} onClick={() => run('accept')}>
            {busy === 'accept' ? 'Accepting…' : 'We will fulfil this'}
          </button>
          <button className="btn ghost inline"  disabled={busy !== null} onClick={() => setRejecting(true)}>
            We cannot
          </button>
        </div>
      )}

      {d.status === 'RECEIVED' && rejecting && (
        <div style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor={`why-${d.id}`}>Why can this order not be fulfilled?</label>
            <input
              id={`why-${d.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Out of stock until Thursday"
            />
            <span className="hint">
              AfriZoneMart decides what happens to the order next, and this is the only thing
              they will have to go on.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn inline"
              
              disabled={busy !== null || reason.trim().length === 0}
              onClick={() => run('reject')}
            >
              {busy === 'reject' ? 'Sending…' : 'Send refusal'}
            </button>
            <button className="btn ghost inline"  onClick={() => setRejecting(false)}>
              Back
            </button>
          </div>
        </div>
      )}

      {d.status !== 'RECEIVED' && !d.preparedAt && LIVE.includes(d.status) && (
        <div style={{ marginTop: 12 }}>
          <button className="btn ghost inline"  disabled={busy !== null} onClick={() => run('prepared')}>
            {busy === 'prepared' ? 'Saving…' : 'Packed and ready'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The store's order inbox.
 *
 * Takes the organization id rather than fetching it: the dashboard has already
 * asked which businesses this person belongs to, and asking again would show a
 * second loading state for a question already answered.
 */
export function StoreOrders({ orgId }: { orgId: string }) {
  const live = useLive<Delivery[]>((signal) => api.storeDeliveries(orgId, signal), [orgId])
  const [orders, replace] = useOverlay(live)
  const error = live.error

  const arrivals = useArrivals((live.data ?? []).map((o) => o.id))
  const waiting = (orders ?? []).filter((o) => o.status === 'RECEIVED').length

  return (
    <>
      <h2 className="sectitle">
        Orders{waiting > 0 ? ` · ${waiting} waiting on you` : ''}
      </h2>
      <Freshness live={live} />

      {error && <ErrorNote message={error} />}
      {!orders && !error && <p className="muted">Loading…</p>}

      {orders && orders.length === 0 && (
        <div className="note">
          No orders yet. When AfriZoneMart sends one, it appears here and waits for you to accept
          it — nothing is dispatched until you do.
        </div>
      )}

      {orders && [...orders].sort(byUrgency).map((o) => (
        <div key={o.id} className={arrivals.has(o.id) ? 'arrived' : undefined}>
          {arrivals.has(o.id) && <div className="arrived-tag">Just in</div>}
          <StoreOrderCard d={o} onChange={replace} />
        </div>
      ))}
    </>
  )
}

/**
 * How fresh this is, and a way to insist.
 *
 * A screen that updates on its own has to SAY so, or somebody stares at it
 * wondering whether it is stuck and reloads anyway - which is the habit the
 * polling was meant to remove. It also has to admit when it has failed: the
 * stale case shows the last good data and says the connection dropped, rather
 * than blanking a counter screen over one lost request.
 */
function Freshness({ live }: { live: { refreshing: boolean; updatedAt: Date | null; stale: boolean; refresh: () => void } }) {
  const [, force] = useState(0)

  // "2 min ago" has to age on its own, or it says "just now" forever.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000)
    return () => clearInterval(t)
  }, [])

  if (!live.updatedAt) return null
  const secs = Math.round((Date.now() - live.updatedAt.getTime()) / 1000)
  const ago = secs < 45 ? 'just now' : secs < 90 ? 'a minute ago' : `${Math.round(secs / 60)} min ago`

  return (
    <div className="fresh">
      {live.stale ? (
        <span className="fresh-stale">Connection dropped &mdash; showing what we last had, from {ago}</span>
      ) : (
        <span>{live.refreshing ? 'Checking…' : `Updated ${ago}`}</span>
      )}
      <button type="button" className="fresh-btn" onClick={live.refresh} disabled={live.refreshing}>
        Check now
      </button>
    </div>
  )
}

// ── The courier ──────────────────────────────────────────────────────────────

/**
 * One job a courier is carrying.
 *
 * The customer's door and number appear here and nowhere else in the product:
 * they are on the job, not on the posting, because a public listing every
 * courier can read is not somewhere a stranger's address belongs.
 */
function CourierJobCard({ d, onChange }: { d: Delivery; onChange: (next: Delivery) => void }) {
  const [busy, setBusy] = useState<'pickup' | 'complete' | 'fail' | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Set when the check could not be MADE. Deliberately not the same state. */
  const [unreachable, setUnreachable] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [failing, setFailing] = useState(false)
  const [reason, setReason] = useState('')

  async function pickUp() {
    setBusy('pickup')
    setError(null)
    try {
      onChange(await api.markPickedUp(d.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not do that.')
    } finally {
      setBusy(null)
    }
  }

  async function complete(e: React.FormEvent) {
    e.preventDefault()
    setBusy('complete')
    setError(null)
    setUnreachable(null)
    try {
      onChange(await api.completeDelivery(d.id, code.trim()))
    } catch (err) {
      // 503 is "we could not ask", and it must never be shown as a wrong code.
      if (err instanceof ApiError && err.status === 503) setUnreachable(err.message)
      else setError(err instanceof ApiError ? err.message : 'Could not check that code.')
    } finally {
      setBusy(null)
    }
  }

  async function fail() {
    setBusy('fail')
    setError(null)
    try {
      onChange(await api.failDelivery(d.id, reason.trim()))
      setFailing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record that.')
    } finally {
      setBusy(null)
    }
  }

  return (
    // A job whose goods are packed and waiting is the one the rider should ride
    // to next, so it is the one that looks different.
    <div className={`card ord${d.preparedAt && d.status === 'COURIER_ASSIGNED' ? ' needs-you' : ''}`}>
      <div className="ord-head">
        <div className="ord-title">
          <b>{d.storeName ?? summarise(d)}</b>
          <span className="ord-ref">
            {d.martOrderId} &middot; {relative(d.createdAt) ?? when(d.createdAt)}
          </span>
        </div>
        <div className="ord-pills">
          <span className={`pill ${PILL[d.status]}`}>{d.statusLabel}</span>
          {d.preparedAt && d.status === 'COURIER_ASSIGNED' && <span className="pill ok">Ready to collect</span>}
        </div>
      </div>

      <div className="rows" style={{ marginTop: 10 }}>
        <div className="row">
          <span className="row-l">Collect from</span>
          <span className="row-v">
            <b>{d.storeName ?? 'the store'}</b>
            {d.pickupAddress ? <><br />{d.pickupAddress}</> : null}
            {/* Only until the goods are in the bag. After that the shop is
                behind them and the customer's door is the only address left. */}
            {d.status !== 'PICKED_UP' ? (
              <Directions
                to={{ lat: d.pickupLat, lng: d.pickupLng, address: d.pickupAddress }}
                label="Directions to the shop"
              />
            ) : null}
          </span>
        </div>
        <div className="row">
          <span className="row-l">Deliver to</span>
          <span className="row-v">
            {d.customerPurged ? (
              <span className="muted">Removed seven days after this order finished</span>
            ) : (
              <>
                {d.customerName ? <><b>{d.customerName}</b><br /></> : null}
                {d.dropoffAddress ?? '—'}
                {d.dropoffInstructions ? <><br /><span className="muted">{d.dropoffInstructions}</span></> : null}
                <Directions
                  to={{ lat: d.dropoffLat, lng: d.dropoffLng, address: d.dropoffAddress }}
                  label="Directions to the door"
                />
                {d.customerPhone ? (
                  <><br /><a href={`tel:${d.customerPhone}`}>{d.customerPhone}</a></>
                ) : null}
              </>
            )}
          </span>
        </div>
        <div className="row">
          <span className="row-l">Items</span>
          <span className="row-v"><Items d={d} /></span>
        </div>
        {d.expectedBy && (
          <div className="row">
            <span className="row-l">Expected by</span>
            <span className="row-v">{when(d.expectedBy)}</span>
          </div>
        )}
        {d.failureReason && (
          <div className="row">
            <span className="row-l">What happened</span>
            <span className="row-v">{d.failureReason}</span>
          </div>
        )}
      </div>

      {error && <ErrorNote message={error} />}

      {unreachable && (
        // Not an ErrorNote and not phrased as the courier's mistake: nothing was
        // checked. Telling somebody the customer got their code wrong, when we
        // never asked, is an argument on a doorstep about a fiction.
        <div className="note" style={{ marginTop: 10 }}>
          {/* The heading leads with the action, not with the fault. The server
              writes the sentence underneath, so this must not repeat it. */}
          <b>Not checked — do not leave the goods</b>
          <br />
          {unreachable} Try again in a moment. If it keeps failing, call Afrizone before you leave.
        </div>
      )}

      {d.status === 'COURIER_ASSIGNED' && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button className="btn inline"  disabled={busy !== null} onClick={pickUp}>
            {busy === 'pickup' ? 'Saving…' : 'Collected from the store'}
          </button>
        </div>
      )}

      {d.status === 'PICKED_UP' && !failing && (
        <form onSubmit={complete} style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor={`code-${d.id}`}>The customer's code</label>
            <input
              id={`code-${d.id}`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="4821"
            />
            <span className="hint">
              AfriZoneMart sent this to the customer. Ask them to read it out — it is the only
              thing that completes the delivery.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn inline"  disabled={busy !== null || code.trim().length === 0}>
              {busy === 'complete' ? 'Checking…' : 'Complete delivery'}
            </button>
            <button
              type="button"
              className="btn ghost inline"
              
              onClick={() => setFailing(true)}
            >
              Could not deliver
            </button>
          </div>
        </form>
      )}

      {d.status === 'PICKED_UP' && failing && (
        <div style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor={`fail-${d.id}`}>What happened?</label>
            <input
              id={`fail-${d.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nobody at the address after three calls"
            />
            <span className="hint">
              Afrizone reads this, and it decides what happens to the goods and to your pay for
              the trip.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn inline"
              
              disabled={busy !== null || reason.trim().length === 0}
              onClick={fail}
            >
              {busy === 'fail' ? 'Saving…' : 'Report it'}
            </button>
            <button className="btn ghost inline"  onClick={() => setFailing(false)}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Every order this courier is carrying, and the ones they have finished. */
export function CourierJobs() {
  const feed = useLive<Delivery[]>((signal) => api.myDeliveries(signal), [])
  const [jobs, replace] = useOverlay(feed)
  const error = feed.error

  const arrivals = useArrivals((feed.data ?? []).map((j) => j.id))
  const live = (jobs ?? []).filter((j) => LIVE.includes(j.status)).length

  return (
    <>
      <h2 className="sectitle">Your deliveries{live > 0 ? ` · ${live} live` : ''}</h2>
      <Freshness live={feed} />

      {error && <ErrorNote message={error} />}
      {!jobs && !error && <p className="muted">Loading…</p>}

      {jobs && jobs.length === 0 && (
        <div className="note">
          Nothing yet. Delivery jobs are posted like any other work — you apply, and they appear
          here once Afrizone assigns one to you.
        </div>
      )}

      {jobs && [...jobs].sort(byUrgency).map((j) => (
        <div key={j.id} className={arrivals.has(j.id) ? 'arrived' : undefined}>
          {arrivals.has(j.id) && <div className="arrived-tag">New job</div>}
          <CourierJobCard d={j} onChange={replace} />
        </div>
      ))}
    </>
  )
}
