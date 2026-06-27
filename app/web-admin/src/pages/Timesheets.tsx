import { useState } from 'react'
import { api, ApiError } from '../api/client'
import { useApi } from '../lib/useApi'
import { avatarGradient, formatDate, initials, timesheetPill } from '../lib/format'
import PageHeader from '../components/PageHeader'
import Glass from '../components/ui/Glass'
import Button from '../components/ui/Button'
import StatusPill from '../components/ui/StatusPill'
import Modal from '../components/ui/Modal'
import Icon from '../components/Icon'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/StateView'

function slaPill(hoursLeft?: number) {
  if (hoursLeft == null) return null
  const variant = hoursLeft <= 6 ? 'danger' : hoursLeft <= 12 ? 'pending' : 'ready'
  return <StatusPill variant={variant} label={`${Math.max(0, Math.round(hoursLeft))}h left`} />
}

export default function Timesheets() {
  const { data, loading, error, reload, setData } = useApi((signal) =>
    api.timesheets('SUBMITTED', signal),
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [disputeId, setDisputeId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const sheets = data ?? []

  async function approve(id: string) {
    setBusy(id)
    setActionError(null)
    try {
      const updated = await api.approveTimesheet(id)
      setData((prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, ...updated } : t)))
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Approve failed')
    } finally {
      setBusy(null)
    }
  }

  async function confirmDispute() {
    if (!disputeId) return
    setBusy(disputeId)
    setActionError(null)
    try {
      const updated = await api.disputeTimesheet(disputeId, reason.trim() || 'Hours mismatch')
      setData((prev) => (prev ?? []).map((t) => (t.id === disputeId ? { ...t, ...updated } : t)))
      setDisputeId(null)
      setReason('')
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Dispute failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        crumb="Operations / Timesheets"
        title="Timesheet approval"
        sub={
          loading
            ? 'Loading…'
            : `${sheets.length} submitted · GPS & clock logs · 24–48h SLA`
        }
      />

      {actionError && (
        <div className="login-error" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={15} />
          {actionError}
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading timesheets…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : sheets.length === 0 ? (
        <Glass>
          <EmptyState
            icon="clock"
            title="No timesheets to review"
            sub="Submitted timesheets appear here with their SLA countdown."
          />
        </Glass>
      ) : (
        <Glass reveal delay="d1" className="tablewrap">
          <table className="dt">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Task</th>
                <th>Period</th>
                <th>Hours</th>
                <th>SLA</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sheets.map((t) => {
                const name = t.worker?.name ?? 'Worker'
                const pill = timesheetPill(t.status)
                return (
                  <tr key={t.id}>
                    <td>
                      <div className="wname">
                        <span className="wav" style={{ background: avatarGradient(name) }}>
                          {initials(name)}
                        </span>
                        <div>
                          {name}
                          {t.gpsNote && (
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.gpsNote}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{t.task?.title ?? '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>
                      {formatDate(t.periodStart)} → {formatDate(t.periodEnd)}
                    </td>
                    <td className="tnum" style={{ fontWeight: 700 }}>
                      {t.hours}h
                    </td>
                    <td>{slaPill(t.slaHoursLeft) ?? '—'}</td>
                    <td>
                      <StatusPill variant={pill.variant} label={pill.label} />
                    </td>
                    <td>
                      {t.status === 'SUBMITTED' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button
                            variant="money"
                            size="sm"
                            loading={busy === t.id}
                            onClick={() => approve(t.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setDisputeId(t.id)
                              setReason('')
                            }}
                          >
                            Dispute
                          </Button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Resolved</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Glass>
      )}

      <Modal
        open={disputeId !== null}
        title="Dispute timesheet"
        subtitle="Flag the hours for the worker to clarify."
        onClose={() => setDisputeId(null)}
      >
        <div className="field" style={{ marginBottom: 18 }}>
          <label htmlFor="dispute-reason">Reason</label>
          <textarea
            id="dispute-reason"
            className="textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Clock-out outside geofence"
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="glass" onClick={() => setDisputeId(null)}>
            Cancel
          </Button>
          <Button variant="danger" icon="alert" loading={busy === disputeId} onClick={confirmDispute}>
            Raise dispute
          </Button>
        </div>
      </Modal>
    </>
  )
}
