import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Shell, { ErrorNote } from './Shell'
import { CourierJobs, StoreOrders } from './Deliveries'
import { useAuth, homeFor } from '../lib/auth'
import { api, ApiError } from '../lib/api'
import type {
  CacStatus,
  CourierReadiness,
  Organization,
  OrgKind,
  OrgMember,
  ReadinessStep,
} from '../lib/types'

/**
 * The three destinations.
 *
 * Orders and deliveries are real now: a store answers its own inbox here and a
 * courier works the jobs they hold. SETTLEMENT is still a shell — Mart holds the
 * money and the endpoint that reports what is owed does not exist yet — and it
 * says so in place of the section it will eventually hold, rather than rendering
 * an empty list that reads as a bug or a promise that reads as a lie.
 */

function statusPill(status: Organization['status']) {
  if (status === 'ACTIVE') return { cls: 'ok', label: 'Open for orders' }
  if (status === 'SUSPENDED') return { cls: 'bad', label: 'Paused by Afrizone' }
  return { cls: 'wait', label: 'Waiting for approval' }
}

/** Guards a route on the server's account type, not on anything the client chose. */
function Guarded({ need, children }: { need: 'STORE' | 'COURIER' | 'INDIVIDUAL'; children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Shell><p className="muted">Loading…</p></Shell>
  if (!user) return <Navigate to="/signin" replace />
  const type = user.accountType ?? 'INDIVIDUAL'
  // Someone who lands on the wrong dashboard is redirected, not scolded.
  if (type !== need) return <Navigate to={homeFor(type)} replace />
  return <>{children}</>
}


const CAC_COPY: Record<CacStatus, { cls: string; label: string; note: string }> = {
  UNVERIFIED: {
    cls: 'wait',
    label: 'Not supplied',
    note: 'Adding your CAC number lets Afrizone confirm the business is registered to you. It is not required to take orders today.',
  },
  PENDING: {
    cls: 'wait',
    label: 'With Afrizone',
    note: 'Recorded. Afrizone will confirm it, and there is nothing else for you to do.',
  },
  VERIFIED: { cls: 'ok', label: 'Confirmed', note: 'Afrizone has confirmed this registration.' },
  REJECTED: {
    cls: 'bad',
    label: 'Not accepted',
    note: 'Afrizone could not confirm this registration. Check the number and submit it again.',
  },
}

/**
 * The store's own view of its CAC registration.
 *
 * OWNER ONLY for the form, which the server enforces independently. Staff still
 * see the status, because "is our registration confirmed" is a fair thing for
 * anyone in the business to know - they simply cannot change it.
 *
 * The number stays editable after submission on purpose. The commonest failure
 * is a typo, and a rejected registration nobody can correct is a dead end.
 */
function CacCard({ org, onUpdated }: { org: Organization; onUpdated: (o: Organization) => void }) {
  const status: CacStatus = org.cacStatus ?? 'UNVERIFIED'
  const copy = CAC_COPY[status]
  const isOwner = org.myRole === 'OWNER'

  const [value, setValue] = useState(org.cacNumber ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await api.submitCac(org.id, value.trim())
      // myRole is not on the submission response; carrying it over keeps the
      // form from vanishing under the owner who just used it.
      onUpdated({ ...updated, myRole: org.myRole })
      // Show what was actually STORED, not what was typed. The server strips
      // spaces and casing, and leaving "rc 771234" on screen next to "Recorded"
      // means the number the store thinks Afrizone holds is not the one it does.
      if (updated.cacNumber) setValue(updated.cacNumber)
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2 className="sectitle">Business registration</h2>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="row-l">CAC status</span>
          <span className={`pill ${copy.cls}`}>{copy.label}</span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{copy.note}</p>

        {org.cacNote && status === 'REJECTED' && (
          <div className="note">
            <b>Afrizone said</b>
            <br />
            {org.cacNote}
          </div>
        )}

        {isOwner ? (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="cac">CAC registration number</label>
              <input
                id="cac"
                value={value}
                placeholder="RC123456"
                autoComplete="off"
                onChange={(e) => {
                  setValue(e.target.value)
                  setSaved(false)
                }}
              />
            </div>
            {error && <ErrorNote message={error} />}
            {saved && !error && (
              <p className="muted" style={{ marginBottom: 12 }}>
                Recorded. Afrizone will confirm it.
              </p>
            )}
            <button
              className="btn"
              disabled={busy || !value.trim() || value.trim() === (org.cacNumber ?? '')}
            >
              {busy ? 'Saving...' : status === 'UNVERIFIED' ? 'Submit' : 'Update'}
            </button>
          </form>
        ) : (
          <div className="rows">
            <div className="row">
              <span className="row-l">Number</span>
              <span className="row-v">{org.cacNumber || '-'}</span>
            </div>
            <div className="row">
              <span className="row-l">Who can change this</span>
              <span className="row-v">The owner of this store.</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}


/* ─────────────────────────── Store ─────────────────────────── */

function OrgView({ kind }: { kind: OrgKind }) {
  const [orgs, setOrgs] = useState<Organization[] | null>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    api
      .myOrganizations(kind, ctrl.signal)
      .then(async (list) => {
        setOrgs(list)
        if (list.length === 1) {
          setMembers(await api.organizationMembers(list[0].id, ctrl.signal).catch(() => []))
        }
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e instanceof ApiError ? e.message : 'Could not load.')
      })
    return () => ctrl.abort()
  }, [kind])

  const noun = kind === 'STORE' ? 'store' : 'courier company'

  if (error) return <ErrorNote message={error} />
  if (!orgs) return <p className="muted">Loading…</p>

  // Declaring yourself a store is not the same as belonging to one. This is the
  // state most people see first, so it says what happens next.
  if (orgs.length === 0) {
    return (
      <div className="card">
        <h2 className="sectitle" style={{ marginTop: 0 }}>No {noun} on your account yet</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Either someone from your {noun} adds you, or Afrizone registers it. Once that happens it
          appears here.
        </p>
        <div className="note" style={{ marginBottom: 0 }}>
          <b>What to do</b>
          <br />
          If your {noun} is already on Afrizone, ask its owner to add this email. If it is not,
          contact Afrizone to register it — every {noun} is approved before it can take work.
        </div>
      </div>
    )
  }

  const org = orgs[0]
  const pill = statusPill(org.status)

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <h2 className="sectitle" style={{ margin: 0 }}>{org.name}</h2>
          <span className={`pill ${pill.cls}`}>{pill.label}</span>
        </div>
        <div className="rows">
          <div className="row"><span className="row-l">Address</span><span className="row-v">{org.address || '—'}</span></div>
          <div className="row"><span className="row-l">Phone</span><span className="row-v">{org.phone || '—'}</span></div>
          <div className="row">
            <span className="row-l">Payout account</span>
            <span className="row-v">
              {org.bankMasked ? `${org.bankMasked}${org.bankName ? ` · ${org.bankName}` : ''}` : '—'}
            </span>
          </div>
          <div className="row"><span className="row-l">Your role</span><span className="row-v">{org.myRole === 'OWNER' ? 'Owner' : 'Staff'}</span></div>
        </div>
      </div>

      {kind === 'STORE' && <CacCard org={org} onUpdated={(next) => setOrgs([next])} />}

      {/* Orders belong to the STORE, so they hang off the organization. A
          courier's jobs do not: what makes a delivery theirs is holding the
          contract, and a rider on their own bike has no company at all - so
          those are rendered by CourierDashboard rather than from here. */}
      {kind === 'STORE' && <StoreOrders orgId={org.id} />}

      <h2 className="sectitle">People</h2>
      <div className="card">
        {members.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No one else yet.</p>
        ) : (
          <div className="rows">
            {members.map((m) => (
              <div className="row" key={m.id}>
                <span className="row-v"><b>{m.name ?? m.email}</b><br /><span className="muted" style={{ fontSize: 13 }}>{m.email}</span></span>
                <span className={`pill ${m.role === 'OWNER' ? 'ok' : 'wait'}`} style={{ alignSelf: 'center' }}>
                  {m.role === 'OWNER' ? 'Owner' : 'Staff'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export function StoreDashboard() {
  return (
    <Guarded need="STORE">
      <Shell>
        <p className="eyebrow">Store</p>
        <h1 className="pt">Your store</h1>
        <p className="lede">Fulfilment for AfriZoneMart orders.</p>
        <OrgView kind="STORE" />
      </Shell>
    </Guarded>
  )
}

export function CourierDashboard() {
  const { user } = useAuth()
  return (
    <Guarded need="COURIER">
      <Shell>
        <p className="eyebrow">Courier / Dispatch</p>
        <h1 className="pt">Deliveries</h1>
        <p className="lede">
          Hello {user?.name?.split(' ')[0]}. Everything you are carrying, and everything you have
          finished.
        </p>

        {/* Above the checklist deliberately: a rider who is already working
            should not have to scroll past a setup list to find the job they are
            standing outside a shop for. */}
        <CourierJobs />
        <CourierChecklist />

        {/* A courier riding on their own has no company behind them, so this
            screen has to work with no organization at all - which is exactly
            what OrgView's empty state does. */}
        <OrgView kind="COURIER" />
      </Shell>
    </Guarded>
  )
}


const STEP_MARK: Record<ReadinessStep['state'], { cls: string; mark: string }> = {
  DONE: { cls: 'ok', mark: 'Done' },
  WAITING: { cls: 'wait', mark: 'With Afrizone' },
  TODO: { cls: 'wait', mark: 'To do' },
  PROBLEM: { cls: 'bad', mark: 'Needs fixing' },
}

/**
 * What a courier still has to do before they can be given deliveries.
 *
 * THE ORDER IS THE POINT. Identity first, because everything after it is a
 * claim about a person nobody has confirmed exists. The vehicle second, because
 * what it is decides which papers the third group asks for - somebody
 * delivering on foot is asked for none, and a step they could never complete
 * would teach them to ignore the whole list.
 *
 * "With Afrizone" is not a failure state and is not counted as outstanding. A
 * rider who has uploaded everything and is waiting on a review has nothing left
 * to do, and telling them otherwise sends them chasing work that is not theirs.
 *
 * Documents are uploaded in the mobile app, not here. This says so rather than
 * offering a file picker that would be a second, thinner version of a flow that
 * already exists and works.
 */
function CourierChecklist() {
  const [data, setData] = useState<CourierReadiness | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [vehicleType, setVehicleType] = useState('')
  const [plate, setPlate] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    api
      .courierReadiness(ctrl.signal)
      .then((r) => {
        setData(r)
        setVehicleType(r.vehicle?.type ?? '')
        setPlate(r.vehicle?.plateNumber ?? '')
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e instanceof ApiError ? e.message : 'Could not load.')
      })
    return () => ctrl.abort()
  }, [])

  if (error) return <ErrorNote message={error} />
  if (!data) return <p className="muted">Loading...</p>

  const chosen = data.vehicleTypes.find((v) => v.value === vehicleType)
  const needsPlate = chosen?.requiresPlate ?? false
  const changed =
    vehicleType !== (data.vehicle?.type ?? '') ||
    (needsPlate && plate.trim() !== (data.vehicle?.plateNumber ?? ''))

  async function saveVehicle(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      const next = await api.saveVehicle(vehicleType, needsPlate ? plate.trim() : null)
      setData(next)
      // The server clears the plate when the vehicle stops needing one; echoing
      // that back stops the form showing a plate the record no longer holds.
      setPlate(next.vehicle?.plateNumber ?? '')
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2 className="sectitle">Getting set up</h2>

      <div className="card">
        {data.ready ? (
          <p style={{ marginTop: 0 }}>
            <b>You are set up.</b> Deliveries you are given appear at the top of this page.
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            {data.outstanding === 0
              ? 'Everything is with Afrizone. There is nothing for you to do right now.'
              : `${data.outstanding} thing${data.outstanding === 1 ? '' : 's'} left for you to do.`}
          </p>
        )}

        <div className="rows">
          {data.steps.map((step) => {
            const mark = STEP_MARK[step.state]
            return (
              <div className="row" key={step.key}>
                <span className="row-l">{step.label}</span>
                <span className="row-v">
                  <span className={`pill ${mark.cls}`}>{mark.mark}</span>
                  <br />
                  <span className="muted" style={{ fontSize: 13 }}>{step.detail}</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <form onSubmit={saveVehicle}>
          <div className="field">
            <label htmlFor="vt">What do you deliver on?</label>
            <select
              id="vt"
              value={vehicleType}
              onChange={(e) => {
                setVehicleType(e.target.value)
                setFormError(null)
              }}
            >
              <option value="" disabled>
                Choose one
              </option>
              {data.vehicleTypes.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          {needsPlate && (
            <div className="field">
              <label htmlFor="plate">Plate number</label>
              <input
                id="plate"
                value={plate}
                placeholder="ABC 123 DE"
                autoComplete="off"
                onChange={(e) => setPlate(e.target.value)}
              />
            </div>
          )}

          {formError && <ErrorNote message={formError} />}

          <button className="btn" disabled={busy || !vehicleType || !changed || (needsPlate && !plate.trim())}>
            {busy ? 'Saving...' : data.vehicle ? 'Update vehicle' : 'Save vehicle'}
          </button>
        </form>
      </div>

      {/* Uploading happens in the app. Saying so is better than a file picker
          here that would be a second, thinner copy of a flow that works. */}
      {data.steps.some((st) => st.state === 'TODO' && st.key !== 'vehicle') && (
        <div className="note">
          <b>Documents go in the Afrizone app</b>
          <br />
          Your licence, vehicle papers and insurance are uploaded there, where you can photograph
          them directly.
        </div>
      )}
    </>
  )
}


/* ─────────────────────────── Individual ─────────────────────────── */

/**
 * Individuals are pointed at the mobile app rather than given a web dashboard.
 *
 * The worker experience already exists, is finished, and is built around things
 * a phone does well — clocking in on site, photographing evidence, getting a
 * push when a task is approved. Rebuilding it here would be the same product
 * twice, and the second one would always be behind.
 */
export function IndividualLanding() {
  const { user } = useAuth()
  return (
    <Shell>
      <p className="eyebrow">Individual</p>
      <h1 className="pt">Your work lives in the app</h1>
      <p className="lede">
        {user ? `You are signed in, ${user.name.split(' ')[0]}. ` : ''}
        Finding tasks, clocking in on site, sending proof of work and getting paid all happen in the
        AfriZone Part Time app.
      </p>

      <div className="card form-narrow" style={{ marginLeft: 0 }}>
        <h2 className="sectitle" style={{ marginTop: 0 }}>Get the app</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Install it on your phone and sign in with the same details.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
          <button className="btn" type="button" disabled title="Distribution link not set up yet">
            Download for Android
          </button>
          {!user && (
            <Link className="btn ghost" to="/register/INDIVIDUAL" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>
              Create an account here first
            </Link>
          )}
        </div>
        <p className="alt" style={{ textAlign: 'left', marginTop: 18 }}>
          Run a shop or deliver instead? <Link to="/">Pick a different account type</Link>
        </p>
      </div>
    </Shell>
  )
}
