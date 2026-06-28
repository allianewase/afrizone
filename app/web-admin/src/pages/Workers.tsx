import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api/client'
import { useApi } from '../lib/useApi'
import type { Worker, WorkerDetail } from '../api/types'
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

// ─── Star rating picker ───────────────────────────────────────────────────────
const STAR_PATH = 'M12 2l2.9 6.3 6.8.6-5 4.7 1.5 6.8L12 17l-6.2 3.4 1.5-6.8-5-4.7 6.8-.6Z'

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0)
  const active = hover || value
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer' }}
          aria-label={`${i} star${i !== 1 ? 's' : ''}`}
        >
          <svg viewBox="0 0 24 24" width={24} height={24}>
            <path
              d={STAR_PATH}
              fill={i <= active ? 'var(--gold)' : 'none'}
              stroke={i <= active ? 'var(--gold)' : 'var(--muted)'}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ))}
    </div>
  )
}

// ─── Rate worker modal ────────────────────────────────────────────────────────
function RateModal({
  worker,
  onClose,
  onRated,
}: {
  worker: Worker
  onClose: () => void
  onRated: (updated: Pick<Worker, 'id' | 'rating' | 'completedCount'>) => void
}) {
  const [detail, setDetail] = useState<WorkerDetail | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [taskId, setTaskId] = useState('')
  const [score, setScore] = useState(0)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    api.workerDetail(worker.id).then((d) => {
      if (!cancelled) setDetail(d)
    }).catch((e) => {
      if (!cancelled) setLoadErr(e instanceof ApiError ? e.message : 'Could not load worker tasks')
    })
    return () => { cancelled = true }
  }, [worker.id])

  const approvedTasks = (detail?.applications ?? []).filter((a) => a.status === 'APPROVED' && a.task)

  async function submit() {
    if (!taskId || score < 1) return
    setBusy(true)
    setSubmitErr(null)
    try {
      const updated = await api.rateWorker(worker.id, { taskId, score, note: note.trim() || undefined })
      onRated({ id: worker.id, rating: updated.rating, completedCount: updated.completedCount })
      onClose()
    } catch (e) {
      setSubmitErr(e instanceof ApiError ? e.message : 'Rating failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 16, padding: 28,
        width: 440, maxWidth: '92vw', boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800 }}>Rate {worker.name}</h3>
        <p style={{ margin: '0 0 20px', color: 'var(--muted)', fontSize: 13 }}>
          Rate performance for a completed task. One rating per task is stored.
        </p>

        {loadErr ? (
          <p style={{ color: 'var(--danger)', fontSize: 13 }}>{loadErr}</p>
        ) : !detail ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading tasks…</p>
        ) : approvedTasks.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            This worker has no approved tasks to rate yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Task
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                style={{
                  display: 'block', width: '100%', marginTop: 6, padding: '8px 10px',
                  borderRadius: 8, border: '1px solid var(--line)', background: 'var(--sand)',
                  fontSize: 13, color: 'var(--text)',
                }}
              >
                <option value="">Select a task…</option>
                {approvedTasks.map((a) => (
                  <option key={a.taskId} value={a.taskId}>{a.task!.title}</option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Score
              <div style={{ marginTop: 8 }}>
                <StarPicker value={score} onChange={setScore} />
                {score > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>
                    {score}/5 selected
                  </span>
                )}
              </div>
            </label>

            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Note <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Any feedback for the worker…"
                style={{
                  display: 'block', width: '100%', marginTop: 6, padding: '8px 10px',
                  borderRadius: 8, border: '1px solid var(--line)', background: 'var(--sand)',
                  fontSize: 13, color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </label>

            {submitErr && (
              <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{submitErr}</p>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="glass" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                variant="money"
                size="sm"
                loading={busy}
                disabled={!taskId || score < 1 || busy}
                onClick={submit}
              >
                Submit rating
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Workers() {
  const { data, loading, error, reload, setData } = useApi((signal) => api.workers(signal))
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [ratingWorker, setRatingWorker] = useState<Worker | null>(null)

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

  function handleRated(updated: Pick<Worker, 'id' | 'rating' | 'completedCount'>) {
    setData((prev) =>
      (prev ?? []).map((w) =>
        w.id === updated.id ? { ...w, rating: updated.rating, completedCount: updated.completedCount } : w
      )
    )
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
                          <svg viewBox="0 0 24 24" width={13} height={13} fill="var(--gold)" aria-hidden="true">
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
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button
                            variant="glass"
                            size="sm"
                            onClick={() => setRatingWorker(w)}
                          >
                            Rate
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Glass>
      )}

      {ratingWorker && (
        <RateModal
          worker={ratingWorker}
          onClose={() => setRatingWorker(null)}
          onRated={handleRated}
        />
      )}
    </>
  )
}
