import { useEffect, useState, type FormEvent, type PointerEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useApi } from '../lib/useApi'
import {
  TIER_COLORS,
  TIER_LABELS,
  formatDate,
  taskPay,
  taskPill,
} from '../lib/format'
import type { LocationType, PayModel, Task, Tier } from '../api/types'
import PageHeader from '../components/PageHeader'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import StatusPill from '../components/ui/StatusPill'
import Icon from '../components/Icon'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/StateView'
import './Tasks.css'
import Input from '../components/ui/Input'
import Textarea from '../components/ui/Textarea'
import Select from '../components/ui/Select'
import { Label } from '@/components/shadcn/label'

const TIERS: Tier[] = ['STUDENT', 'DISPATCH', 'REMOTE', 'PROMO', 'TRADE']

function TaskCard({ task, delay }: { task: Task; delay: string }) {
  const filled = task.filledCount ?? 0
  const pct = task.slots > 0 ? Math.min(100, Math.round((filled / task.slots) * 100)) : 0
  const pill = taskPill(task.status)
  const [w, setW] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setW(pct), 200)
    return () => clearTimeout(id)
  }, [pct])

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <div className={`glass tcard rv in ${delay}`} onPointerMove={onMove}>
      <div className="tc-top">
        <span className="tier">
          <span className="d" style={{ background: TIER_COLORS[task.tier] }} />
          {TIER_LABELS[task.tier]}
        </span>
        <span className="pay">{taskPay(task.rate, task.budget, task.payModel)}</span>
      </div>
      <h4>{task.title}</h4>
      <div className="mrow">
        <span>
          <Icon name={task.locationType === 'REMOTE' ? 'help' : 'pin'} />
          {task.locationType === 'REMOTE'
            ? 'Remote · nationwide'
            : task.address || 'On-site'}
        </span>
        <span>
          <Icon name="calendar" />
          {formatDate(task.startDate)} → {formatDate(task.endDate)}
        </span>
        <span>
          <Icon name="users" />
          {task.applicantCount ?? 0} applicants
        </span>
      </div>
      <div className="fillbar">
        <i style={{ width: `${w}%` }} />
      </div>
      <div className="tc-foot">
        <span>
          {filled} of {task.slots} filled
        </span>
        <StatusPill variant={pill.variant} label={pill.label} />
      </div>
    </div>
  )
}

interface FormState {
  title: string
  description: string
  category: string
  tier: Tier
  payModel: PayModel
  rate: string
  budget: string
  startDate: string
  endDate: string
  locationType: LocationType
  address: string
  lat: string
  lng: string
  geofenceRadius: string
  slots: string
  deadline: string
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  category: '',
  tier: 'DISPATCH',
  payModel: 'HOURLY',
  rate: '',
  budget: '',
  startDate: '',
  endDate: '',
  locationType: 'PHYSICAL',
  address: '',
  lat: '',
  lng: '',
  geofenceRadius: '100',
  slots: '1',
  deadline: '',
}

function NewTaskModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (t: Task) => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const body: Partial<Task> = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category.trim() || TIER_LABELS[form.tier],
      tier: form.tier,
      payModel: form.payModel,
      rate: form.payModel === 'HOURLY' ? Number(form.rate) || 0 : undefined,
      budget: form.payModel === 'FIXED' ? Number(form.budget) || 0 : undefined,
      startDate: form.startDate || new Date().toISOString(),
      endDate: form.endDate || new Date().toISOString(),
      locationType: form.locationType,
      address: form.locationType === 'PHYSICAL' ? form.address.trim() : undefined,
      lat: form.locationType === 'PHYSICAL' && form.lat ? Number(form.lat) : undefined,
      lng: form.locationType === 'PHYSICAL' && form.lng ? Number(form.lng) : undefined,
      geofenceRadius: Number(form.geofenceRadius) || 100,
      slots: Number(form.slots) || 1,
      deadline: form.deadline || new Date().toISOString(),
    }
    try {
      const created = await api.createTask(body)
      onCreated(created)
      setForm(EMPTY_FORM)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create task')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Post a new task"
      subtitle="Hourly or fixed · with geofence"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="formgrid">
          <div className="field span2">
            <Label htmlFor="t-title">Title</Label>
            <Input
              id="t-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Same-day parcel runs — Yaba"
              required
            />
          </div>
          <div className="field span2">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea
              id="t-desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="What the worker will do…"
            />
          </div>
          <div className="field">
            <Label htmlFor="t-cat">Category</Label>
            <Input
              id="t-cat"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              placeholder="Dispatch"
            />
          </div>
          <div className="field">
            <Label htmlFor="t-tier">Tier</Label>
            <Select
              id="t-tier"
              value={form.tier}
              onChange={(v) => set('tier', v as Tier)}
              options={TIERS.map((t) => ({ value: t, label: TIER_LABELS[t] }))}
            />
          </div>
          <div className="field">
            <Label htmlFor="t-pm">Pay model</Label>
            <Select
              id="t-pm"
              value={form.payModel}
              onChange={(v) => set('payModel', v as PayModel)}
              options={[
                { value: 'HOURLY', label: 'Hourly' },
                { value: 'FIXED', label: 'Fixed' },
              ]}
            />
          </div>
          {form.payModel === 'HOURLY' ? (
            <div className="field">
              <Label htmlFor="t-rate">Rate (₦/hour)</Label>
              <Input
                id="t-rate"
                className="tnum"
                type="number"
                min="0"
                value={form.rate}
                onChange={(e) => set('rate', e.target.value)}
                placeholder="2500"
                required
              />
            </div>
          ) : (
            <div className="field">
              <Label htmlFor="t-budget">Budget (₦)</Label>
              <Input
                id="t-budget"
                className="tnum"
                type="number"
                min="0"
                value={form.budget}
                onChange={(e) => set('budget', e.target.value)}
                placeholder="18000"
                required
              />
            </div>
          )}
          <div className="field">
            <Label htmlFor="t-slots">Slots</Label>
            <Input
              id="t-slots"
              className="tnum"
              type="number"
              min="1"
              value={form.slots}
              onChange={(e) => set('slots', e.target.value)}
              required
            />
          </div>
          <div className="field">
            <Label htmlFor="t-loc">Location type</Label>
            <Select
              id="t-loc"
              value={form.locationType}
              onChange={(v) => set('locationType', v as LocationType)}
              options={[
                { value: 'PHYSICAL', label: 'Physical' },
                { value: 'REMOTE', label: 'Remote' },
              ]}
            />
          </div>
          {form.locationType === 'PHYSICAL' && (
            <>
              <div className="field span2">
                <Label htmlFor="t-addr">Address</Label>
                <Input
                  id="t-addr"
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="Ikeja City Mall"
                />
              </div>
              <div className="field">
                <Label htmlFor="t-lat">Latitude (optional)</Label>
                <Input
                  id="t-lat"
                  className="tnum"
                  type="number"
                  step="any"
                  value={form.lat}
                  onChange={(e) => set('lat', e.target.value)}
                  placeholder="6.6018"
                />
              </div>
              <div className="field">
                <Label htmlFor="t-lng">Longitude (optional)</Label>
                <Input
                  id="t-lng"
                  className="tnum"
                  type="number"
                  step="any"
                  value={form.lng}
                  onChange={(e) => set('lng', e.target.value)}
                  placeholder="3.3515"
                />
              </div>
              <div className="field">
                <Label htmlFor="t-geo">Geofence radius (m)</Label>
                <Input
                  id="t-geo"
                  className="tnum"
                  type="number"
                  min="0"
                  value={form.geofenceRadius}
                  onChange={(e) => set('geofenceRadius', e.target.value)}
                />
              </div>
            </>
          )}
          <div className="field">
            <Label htmlFor="t-start">Start date</Label>
            <Input
              id="t-start"
              type="date"
              value={form.startDate}
              onChange={(e) => set('startDate', e.target.value)}
            />
          </div>
          <div className="field">
            <Label htmlFor="t-end">End date</Label>
            <Input
              id="t-end"
              type="date"
              value={form.endDate}
              onChange={(e) => set('endDate', e.target.value)}
            />
          </div>
          <div className="field span2">
            <Label htmlFor="t-deadline">Application deadline</Label>
            <Input
              id="t-deadline"
              type="date"
              value={form.deadline}
              onChange={(e) => set('deadline', e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="login-error" role="alert" style={{ marginTop: 16 }}>
            <Icon name="alert" size={15} />
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <Button type="button" variant="glass" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon="check" loading={submitting}>
            Publish task
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Tasks() {
  const { data, loading, error, reload, setData } = useApi((signal) => api.tasks(signal))
  const [params, setParams] = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)

  // open modal if topbar linked here with ?new=1
  useEffect(() => {
    if (params.get('new') === '1') {
      setModalOpen(true)
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const tasks = data ?? []
  const open = tasks.filter((t) => t.status === 'OPEN').length

  return (
    <>
      <PageHeader
        crumb="Operations / Tasks"
        title="Tasks"
        sub={
          loading
            ? 'Loading…'
            : `${tasks.length} total · ${open} open`
        }
        actions={
          <Button variant="primary" size="sm" icon="plus" onClick={() => setModalOpen(true)}>
            New task
          </Button>
        }
      />

      {loading ? (
        <LoadingState label="Loading tasks…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : tasks.length === 0 ? (
        <div className="glass">
          <EmptyState
            icon="tasks"
            title="No tasks yet"
            sub="Post your first task — hourly or fixed, with an optional geofence."
            action={
              <Button variant="primary" size="sm" icon="plus" onClick={() => setModalOpen(true)}>
                New task
              </Button>
            }
          />
        </div>
      ) : (
        <div className="taskgrid">
          {tasks.map((t, i) => (
            <TaskCard key={t.id} task={t} delay={`d${(i % 5) + 1}`} />
          ))}
          <button
            className="glass tcard tcard-add rv in d5"
            onClick={() => setModalOpen(true)}
            aria-label="Post a new task"
          >
            <div className="add-inner">
              <div className="add-ic">
                <Icon name="plus" style={{ color: 'var(--gold)' }} size={22} />
              </div>
              <b>Post a new task</b>
              <span>Hourly or fixed · with geofence</span>
            </div>
          </button>
        </div>
      )}

      <NewTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(t) => setData((prev) => [t, ...(prev ?? [])])}
      />
    </>
  )
}
