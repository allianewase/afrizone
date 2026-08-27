import { Suspense, lazy, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useApi } from '../lib/useApi'
import type { MapNode, OrgKind } from '../api/types'
import PageHeader from '../components/PageHeader'
import Glass from '../components/ui/Glass'
import Button from '../components/ui/Button'
import Icon from '../components/Icon'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/StateView'
import { PIN_COLOR } from '../lib/orgColors'
import './Network.css'

/**
 * The live network of approved businesses (Blueprint §8).
 *
 * ONLY APPROVED BUSINESSES APPEAR, which is the server's rule and the right one —
 * a store awaiting approval is not part of the network. That makes the `unplaced`
 * count load-bearing rather than trivia: an approved store with no coordinates is
 * invisible here, and dropping it silently is how somebody concludes it was never
 * approved at all.
 */

// Leaflet is ~150KB and only this screen draws a map, so it is fetched on
// arrival rather than shipped in the bundle every other page pays for.
const NetworkMap = lazy(() => import('../components/map-view'))

const KINDS: { key: OrgKind; label: string }[] = [
  { key: 'STORE', label: 'Stores' },
  { key: 'COURIER', label: 'Courier companies' },
]

export default function Network() {
  const [kind, setKind] = useState<OrgKind>('STORE')
  /** A reference point to measure from. Set by clicking the map. */
  const [from, setFrom] = useState<{ lat: number; lng: number } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)

  const { data, loading, error, reload } = useApi(
    (signal) => api.orgMap(kind, from, signal),
    [kind, from?.lat, from?.lng],
  )

  const nodes = useMemo(() => data?.nodes ?? [], [data])

  function focusNode(n: MapNode) {
    setSelected(n.id)
    setFocus((prev) => ({ id: n.id, n: (prev?.n ?? 0) + 1 }))
  }

  return (
    <>
      <PageHeader
        crumb="People / Network"
        title="Store network"
        sub="Approved businesses, as places somebody can travel to. Click the map to measure distances from a point."
        actions={
          <Button variant="glass" size="sm" icon="check" onClick={reload}>
            Refresh
          </Button>
        }
      />

      <div className="net-bar">
        {KINDS.map((k) => (
          <button
            key={k.key}
            className={`btn btn-sm ${kind === k.key ? 'btn-primary' : 'btn-glass'}`}
            onClick={() => {
              setKind(k.key)
              setSelected(null)
              setFocus(null)
            }}
          >
            {k.label}
          </button>
        ))}
        {from && (
          <Button variant="glass" size="sm" icon="x" onClick={() => setFrom(null)}>
            Clear reference point
          </Button>
        )}
        <span className="net-count">{loading ? 'Loading…' : `${data?.count ?? 0} on the map`}</span>
      </div>

      {!loading && (data?.unplaced ?? 0) > 0 && (
        <Glass className="net-warn">
          <Icon name="alert" size={16} />
          <span>
            <b>
              {data!.unplaced} approved {data!.unplaced === 1 ? 'business is' : 'businesses are'} not
              shown
            </b>{' '}
            — no coordinates recorded. They are approved and can take work; they just cannot be
            navigated to. Set their location on the Organizations screen.
          </span>
        </Glass>
      )}

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="net-grid">
          <Glass className="net-mapcard">
            <Suspense fallback={<div className="net-map net-map-loading">Loading map…</div>}>
              <NetworkMap
                nodes={nodes}
                from={from}
                focus={focus}
                onPickOrigin={setFrom}
                onSelect={setSelected}
              />
            </Suspense>
          </Glass>

          <Glass className="net-list">
            {loading ? (
              <LoadingState label="Loading network…" />
            ) : nodes.length === 0 ? (
              <EmptyState
                icon="pin"
                title={kind === 'STORE' ? 'No stores on the map' : 'No courier companies on the map'}
                sub="Only approved businesses with coordinates appear here."
              />
            ) : (
              <ul className="net-items">
                {nodes.map((n) => (
                  <li key={n.id}>
                    <button
                      className={`net-item ${selected === n.id ? 'sel' : ''}`}
                      onClick={() => focusNode(n)}
                    >
                      <span className="net-dot" style={{ background: PIN_COLOR[n.kind] }} />
                      <span className="net-body">
                        <span className="net-name">{n.name}</span>
                        <span className="net-addr">{n.address ?? 'No address recorded'}</span>
                      </span>
                      {n.distance && <span className="net-dist tnum">{n.distance}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Glass>
        </div>
      )}
    </>
  )
}
