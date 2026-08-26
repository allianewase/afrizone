import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Shell, { ErrorNote } from './Shell'
import { useAuth, homeFor } from '../lib/auth'
import { api, ApiError } from '../lib/api'
import type { Organization, OrgKind, OrgMember } from '../lib/types'

/**
 * The three destinations.
 *
 * Every one of these is a SHELL. Orders, deliveries and settlement are not
 * built — the Mart connection they depend on is still a proposal. Each screen
 * says so in place of the section it will eventually hold, rather than
 * rendering an empty list that reads as a bug or a promise that reads as a lie.
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

      <h2 className="sectitle">{kind === 'STORE' ? 'Orders' : 'Deliveries'}</h2>
      <div className="note">
        {kind === 'STORE'
          ? 'Orders from AfriZoneMart will arrive here. That connection is not switched on yet.'
          : 'Delivery jobs will arrive here. That connection is not switched on yet.'}
      </div>

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
          Hello {user?.name?.split(' ')[0]}. Delivery jobs will appear here once the AfriZoneMart
          connection is live.
        </p>
        {/* A courier riding on their own has no company behind them, so this
            screen has to work with no organization at all - which is exactly
            what OrgView's empty state does. */}
        <OrgView kind="COURIER" />
      </Shell>
    </Guarded>
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
