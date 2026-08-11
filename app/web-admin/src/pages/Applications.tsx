import { useState } from 'react'
import { api, ApiError } from '../api/client'
import { useApi } from '../lib/useApi'
import { TIER_COLORS, TIER_LABELS, appPill, avatarGradient, initials, kycPill } from '../lib/format'
import PageHeader from '../components/PageHeader'
import Glass from '../components/ui/Glass'
import Button from '../components/ui/Button'
import StatusPill from '../components/ui/StatusPill'
import Modal from '../components/ui/Modal'
import Icon from '../components/Icon'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/StateView'
import Textarea from '../components/ui/Textarea'
import { Label } from '@/components/shadcn/label'
import { Avatar, AvatarFallback } from '@/components/shadcn/avatar'
import { Badge } from '@/components/shadcn/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/table'

export default function Applications() {
  const { data, loading, error, reload, setData } = useApi((signal) =>
    api.applications('APPLIED', signal),
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const apps = data ?? []

  async function approve(id: string) {
    setBusy(id)
    setActionError(null)
    try {
      const updated = await api.approveApplication(id)
      setData((prev) => (prev ?? []).map((a) => (a.id === id ? { ...a, ...updated } : a)))
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Approve failed')
    } finally {
      setBusy(null)
    }
  }

  async function confirmReject() {
    if (!rejectId) return
    setBusy(rejectId)
    setActionError(null)
    try {
      const updated = await api.rejectApplication(rejectId, reason.trim() || 'Not a fit')
      setData((prev) => (prev ?? []).map((a) => (a.id === rejectId ? { ...a, ...updated } : a)))
      setRejectId(null)
      setReason('')
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Reject failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        crumb="Operations / Applications"
        title="Application review queue"
        sub={loading ? 'Loading…' : `${apps.length} applications awaiting approval`}
      />

      {actionError && (
        <div className="login-error" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={15} />
          {actionError}
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading applications…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : apps.length === 0 ? (
        <Glass>
          <EmptyState
            icon="check-circle"
            title="Queue is clear"
            sub="No applications are awaiting approval right now."
          />
        </Glass>
      ) : (
        <Glass reveal delay="d1" className="tablewrap">
          <Table className="dt">
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>KYC</TableHead>
                <TableHead>Pitch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.map((a) => {
                const name = a.worker?.name ?? 'Worker'
                const pill = appPill(a.status)
                const tier = a.worker?.tiers?.[0]
                const kyc = a.worker?.kycStatus ? kycPill(a.worker.kycStatus) : null
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="wname">
                        <Avatar className="wav">
                            <AvatarFallback style={{ background: avatarGradient(name) }}>{initials(name)}</AvatarFallback>
                          </Avatar>
                        {name}
                      </div>
                    </TableCell>
                    <TableCell>{a.task?.title ?? '—'}</TableCell>
                    <TableCell>
                      {tier ? (
                        <Badge variant="outline" className="tier">
                            <span className="d" style={{ background: TIER_COLORS[tier] }} />
                            {TIER_LABELS[tier]}
                          </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{kyc ? <StatusPill variant={kyc.variant} label={kyc.label} /> : '—'}</TableCell>
                    <TableCell style={{ maxWidth: 260, color: 'var(--muted)' }}>{a.pitch || '—'}</TableCell>
                    <TableCell>
                      <StatusPill variant={pill.variant} label={pill.label} />
                    </TableCell>
                    <TableCell>
                      {a.status === 'APPLIED' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button
                            variant="money"
                            size="sm"
                            loading={busy === a.id}
                            onClick={() => approve(a.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setRejectId(a.id)
                              setReason('')
                            }}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{a.reason || '—'}</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Glass>
      )}

      <Modal
        open={rejectId !== null}
        title="Reject application"
        subtitle="The reason is shared with the worker."
        onClose={() => setRejectId(null)}
      >
        <div className="field" style={{ marginBottom: 18 }}>
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Tier requirements not met"
          />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="glass" onClick={() => setRejectId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            icon="x"
            loading={busy === rejectId}
            onClick={confirmReject}
          >
            Reject application
          </Button>
        </div>
      </Modal>
    </>
  )
}
