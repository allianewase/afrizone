import { useState } from 'react'
import { api, ApiError } from '../api/client'
import { useApi } from '../lib/useApi'
import {
  TIER_COLORS,
  TIER_LABELS,
  avatarGradient,
  initials,
  kycPill,
} from '../lib/format'
import PageHeader from '../components/PageHeader'
import Glass from '../components/ui/Glass'
import Button from '../components/ui/Button'
import StatusPill from '../components/ui/StatusPill'
import Icon from '../components/Icon'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/StateView'

export default function Workers() {
  const { data, loading, error, reload, setData } = useApi((signal) => api.workers(signal))
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const workers = data ?? []
  const pendingKyc = workers.filter((w) => w.kycStatus === 'PENDING').length

  async function decide(id: string, decision: 'TIER_APPROVED' | 'REJECTED') {
    setBusy(id + decision)
    setActionError(null)
    try {
      const updated = await api.reviewKyc(id, decision)
      setData((prev) => (prev ?? []).map((w) => (w.id === id ? { ...w, ...updated } : w)))
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'KYC review failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        crumb="People / Workers"
        title="Worker directory & KYC"
        sub={loading ? 'Loading…' : `${workers.length} workers · ${pendingKyc} KYC reviews pending`}
        actions={
          <Button variant="glass" size="sm" icon="arrow-up">
            Export CSV
          </Button>
        }
      />

      {actionError && (
        <div className="login-error" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={15} />
          {actionError}
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading workers…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : workers.length === 0 ? (
        <Glass>
          <EmptyState icon="users" title="No workers yet" sub="Verified workers will appear here for KYC review." />
        </Glass>
      ) : (
        <Glass reveal delay="d1" className="tablewrap">
          <table className="dt">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Tiers</th>
                <th>KYC</th>
                <th>Completed</th>
                <th>Rating</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const pill = kycPill(w.kycStatus)
                return (
                  <tr key={w.id}>
                    <td>
                      <div className="wname">
                        <span className="wav" style={{ background: avatarGradient(w.name) }}>
                          {initials(w.name)}
                        </span>
                        <div>
                          {w.name}
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{w.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(w.tiers ?? []).map((t) => (
                          <span className="tier" key={t}>
                            <span className="d" style={{ background: TIER_COLORS[t] }} />
                            {TIER_LABELS[t]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <StatusPill variant={pill.variant} label={pill.label} />
                    </td>
                    <td className="tnum">{w.completedCount}</td>
                    <td className="tnum">
                      {w.rating != null ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {w.rating.toFixed(1)}
                          <svg
                            viewBox="0 0 24 24"
                            width={13}
                            height={13}
                            fill="var(--gold)"
                            aria-hidden="true"
                          >
                            <path d="M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 22l2-7L2 9h7z" />
                          </svg>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {w.kycStatus === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button
                            variant="money"
                            size="sm"
                            loading={busy === w.id + 'TIER_APPROVED'}
                            onClick={() => decide(w.id, 'TIER_APPROVED')}
                          >
                            Approve KYC
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={busy === w.id + 'REJECTED'}
                            onClick={() => decide(w.id, 'REJECTED')}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <Button variant="glass" size="sm" icon="eye">
                          View
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Glass>
      )}
    </>
  )
}
