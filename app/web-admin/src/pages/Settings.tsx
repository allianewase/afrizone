import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, ApiError } from '../api/client'
import { useApi } from '../lib/useApi'
import { TIER_LABELS } from '../lib/format'
import { useAuth } from '../auth/AuthContext'
import type {
  Category,
  PayModel,
  TaxRate,
  Template,
  Tier,
  TwoFactorSetup,
} from '../api/types'
import PageHeader from '../components/PageHeader'
import Glass from '../components/ui/Glass'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import OtpInput from '../components/ui/OtpInput'
import Icon from '../components/Icon'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/StateView'
import './Settings.css'

const TIERS: Tier[] = ['STUDENT', 'DISPATCH', 'REMOTE', 'PROMO', 'TRADE']
type Tab = 'tax' | 'categories' | 'templates' | 'security'

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  )
}

/* ===================== Tax Rates ===================== */

interface RateForm {
  jurisdiction: string
  category: string
  whtRate: string
  vatRate: string
}
const EMPTY_RATE: RateForm = { jurisdiction: '', category: 'default', whtRate: '5', vatRate: '0' }

function AddRateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (r: TaxRate) => void
}) {
  const [form, setForm] = useState<RateForm>(EMPTY_RATE)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const created = await api.createTaxRate({
        jurisdiction: form.jurisdiction.trim(),
        category: form.category.trim() || 'default',
        whtRate: (Number(form.whtRate) || 0) / 100,
        vatRate: (Number(form.vatRate) || 0) / 100,
        active: true,
      })
      onCreated(created)
      setForm(EMPTY_RATE)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add rate')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title="Add tax rate" subtitle="WHT and VAT by jurisdiction" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="formgrid">
          <div className="field">
            <label htmlFor="r-jur">Jurisdiction</label>
            <input
              id="r-jur"
              className="input"
              value={form.jurisdiction}
              onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))}
              placeholder="Federal"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="r-cat">Category</label>
            <input
              id="r-cat"
              className="input"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Services"
            />
          </div>
          <div className="field">
            <label htmlFor="r-wht">WHT %</label>
            <input
              id="r-wht"
              className="input tnum"
              type="number"
              min="0"
              step="0.1"
              value={form.whtRate}
              onChange={(e) => setForm((f) => ({ ...f, whtRate: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="r-vat">VAT %</label>
            <input
              id="r-vat"
              className="input tnum"
              type="number"
              min="0"
              step="0.1"
              value={form.vatRate}
              onChange={(e) => setForm((f) => ({ ...f, vatRate: e.target.value }))}
              required
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
            Add rate
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function TaxRatesTab({ canEdit }: { canEdit: boolean }) {
  const { data, loading, error, reload, setData } = useApi((signal) => api.taxRates(signal))
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const rates = useMemo(() => data ?? [], [data])

  async function patch(id: string, body: Partial<TaxRate>) {
    setBusy(id)
    setActionError(null)
    try {
      const updated = await api.patchTaxRate(id, body)
      setData((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, ...updated } : r)))
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Update failed')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <LoadingState label="Loading tax rates…" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <>
      <div className="tabhead">
        <p className="tabhint">
          Withholding and VAT rates applied at source per jurisdiction and category.
        </p>
        {canEdit && (
          <Button variant="primary" size="sm" icon="plus" onClick={() => setModalOpen(true)}>
            Add rate
          </Button>
        )}
      </div>

      {actionError && (
        <div className="login-error" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={15} />
          {actionError}
        </div>
      )}

      {rates.length === 0 ? (
        <Glass>
          <EmptyState icon="percent" title="No tax rates" sub="Add a jurisdiction rate to start." />
        </Glass>
      ) : (
        <Glass className="tablewrap">
          <table className="dt">
            <thead>
              <tr>
                <th>Jurisdiction</th>
                <th>Category</th>
                <th>WHT %</th>
                <th>VAT %</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.jurisdiction}</td>
                  <td>{r.category}</td>
                  <td>
                    <input
                      className="input tnum cell"
                      type="number"
                      min="0"
                      step="0.1"
                      disabled={!canEdit || busy === r.id}
                      defaultValue={(r.whtRate * 100).toString()}
                      onBlur={(e) => {
                        const v = (Number(e.target.value) || 0) / 100
                        if (v !== r.whtRate) patch(r.id, { whtRate: v })
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="input tnum cell"
                      type="number"
                      min="0"
                      step="0.1"
                      disabled={!canEdit || busy === r.id}
                      defaultValue={(r.vatRate * 100).toString()}
                      onBlur={(e) => {
                        const v = (Number(e.target.value) || 0) / 100
                        if (v !== r.vatRate) patch(r.id, { vatRate: v })
                      }}
                    />
                  </td>
                  <td>
                    <Toggle
                      checked={r.active}
                      disabled={!canEdit || busy === r.id}
                      label={`Toggle ${r.jurisdiction} ${r.category} active`}
                      onChange={(v) => patch(r.id, { active: v })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Glass>
      )}

      <AddRateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(r) => setData((prev) => [...(prev ?? []), r])}
      />
    </>
  )
}

/* ===================== Categories ===================== */

interface CatForm {
  name: string
  tier: Tier
  defaultPayModel: PayModel
}
const EMPTY_CAT: CatForm = { name: '', tier: 'DISPATCH', defaultPayModel: 'HOURLY' }

function AddCategoryModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (c: Category) => void
}) {
  const [form, setForm] = useState<CatForm>(EMPTY_CAT)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const created = await api.createCategory({
        name: form.name.trim(),
        tier: form.tier,
        defaultPayModel: form.defaultPayModel,
        active: true,
      })
      onCreated(created)
      setForm(EMPTY_CAT)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add category')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title="Add category" subtitle="Task category defaults" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="formgrid">
          <div className="field span2">
            <label htmlFor="c-name">Name</label>
            <input
              id="c-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Dispatch"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="c-tier">Tier</label>
            <select
              id="c-tier"
              className="select"
              value={form.tier}
              onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as Tier }))}
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-pm">Default pay model</label>
            <select
              id="c-pm"
              className="select"
              value={form.defaultPayModel}
              onChange={(e) =>
                setForm((f) => ({ ...f, defaultPayModel: e.target.value as PayModel }))
              }
            >
              <option value="HOURLY">Hourly</option>
              <option value="FIXED">Fixed</option>
            </select>
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
            Add category
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function CategoriesTab({ canEdit }: { canEdit: boolean }) {
  const { data, loading, error, reload, setData } = useApi((signal) => api.categories(signal))
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const cats = useMemo(() => data ?? [], [data])

  async function toggleActive(c: Category, active: boolean) {
    setBusy(c.id)
    setActionError(null)
    try {
      const updated = await api.patchCategory(c.id, { active })
      setData((prev) => (prev ?? []).map((x) => (x.id === c.id ? { ...x, ...updated } : x)))
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Update failed')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <LoadingState label="Loading categories…" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <>
      <div className="tabhead">
        <p className="tabhint">Task categories with their default tier and pay model.</p>
        {canEdit && (
          <Button variant="primary" size="sm" icon="plus" onClick={() => setModalOpen(true)}>
            Add category
          </Button>
        )}
      </div>

      {actionError && (
        <div className="login-error" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={15} />
          {actionError}
        </div>
      )}

      {cats.length === 0 ? (
        <Glass>
          <EmptyState icon="tag" title="No categories" sub="Add a category to configure defaults." />
        </Glass>
      ) : (
        <Glass className="tablewrap">
          <table className="dt">
            <thead>
              <tr>
                <th>Category</th>
                <th>Tier</th>
                <th>Default pay model</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{TIER_LABELS[c.tier] ?? c.tier}</td>
                  <td>{c.defaultPayModel === 'HOURLY' ? 'Hourly' : 'Fixed'}</td>
                  <td>
                    <Toggle
                      checked={c.active}
                      disabled={!canEdit || busy === c.id}
                      label={`Toggle ${c.name} active`}
                      onChange={(v) => toggleActive(c, v)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Glass>
      )}

      <AddCategoryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(c) => setData((prev) => [...(prev ?? []), c])}
      />
    </>
  )
}

/* ===================== Templates ===================== */

function TemplateCard({
  tpl,
  canEdit,
  onSaved,
}: {
  tpl: Template
  canEdit: boolean
  onSaved: (t: Template) => void
}) {
  const [value, setValue] = useState(tpl.value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = value !== tpl.value

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.putTemplate(tpl.key, value)
      onSaved(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Glass reveal style={{ padding: 18 }}>
      <div className="card-h" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>
            <Icon name="mail" size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {tpl.key}
          </h3>
        </div>
        {canEdit && (
          <Button
            variant="money"
            size="sm"
            icon="check"
            loading={saving}
            disabled={!dirty}
            onClick={save}
          >
            Save
          </Button>
        )}
      </div>
      <textarea
        className="textarea"
        value={value}
        disabled={!canEdit}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Template ${tpl.key}`}
      />
      {error && (
        <div className="login-error" role="alert" style={{ marginTop: 12 }}>
          <Icon name="alert" size={15} />
          {error}
        </div>
      )}
    </Glass>
  )
}

function TemplatesTab({ canEdit }: { canEdit: boolean }) {
  const { data, loading, error, reload, setData } = useApi((signal) => api.templates(signal))
  const templates = useMemo(() => data ?? [], [data])

  if (loading) return <LoadingState label="Loading templates…" />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <>
      <div className="tabhead">
        <p className="tabhint">
          Notification and contract templates. Use placeholders like <code>{'{{name}}'}</code>.
        </p>
      </div>
      {templates.length === 0 ? (
        <Glass>
          <EmptyState icon="mail" title="No templates" sub="Templates appear here once configured." />
        </Glass>
      ) : (
        <div className="tpl-grid">
          {templates.map((t) => (
            <TemplateCard
              key={t.key}
              tpl={t}
              canEdit={canEdit}
              onSaved={(u) =>
                setData((prev) => (prev ?? []).map((x) => (x.key === u.key ? u : x)))
              }
            />
          ))}
        </div>
      )}
    </>
  )
}

/* ===================== Security (2FA) ===================== */

function EnableTwoFactorModal({
  open,
  onClose,
  onEnabled,
}: {
  open: boolean
  onClose: () => void
  onEnabled: () => void
}) {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null)
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')
  const [enabling, setEnabling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Call /2fa/setup once each time the modal opens (stores a pending secret).
  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError(null)
    setSetup(null)
    setCode('')
    api
      .twoFactorSetup()
      .then((s) => {
        if (active) setSetup(s)
      })
      .catch((err) => {
        if (active)
          setError(err instanceof ApiError ? err.message : 'Could not start 2FA setup')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open])

  function close() {
    setSetup(null)
    setCode('')
    setError(null)
    onClose()
  }

  async function enable(value: string) {
    if (enabling) return
    setError(null)
    setEnabling(true)
    try {
      await api.twoFactorEnable(value)
      onEnabled()
      close()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid code')
      setCode('')
    } finally {
      setEnabling(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Enable two-factor"
      subtitle="Scan the QR code in your authenticator app"
      onClose={close}
    >
      {loading ? (
        <LoadingState label="Preparing your secret…" />
      ) : error && !setup ? (
        <ErrorState message={error} />
      ) : setup ? (
        <div className="twofa-setup">
          <div className="twofa-qr">
            <img src={setup.qrDataUrl} alt="Two-factor QR code" width={176} height={176} />
          </div>
          <p className="tabhint">
            Can’t scan? Enter this secret manually:
          </p>
          <code className="twofa-secret">{setup.secret}</code>
          <p className="tabhint" style={{ marginTop: 10 }}>
            Then enter the 6-digit code shown in your app to confirm.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (code.length === 6) enable(code)
            }}
            style={{ marginTop: 12 }}
          >
            <OtpInput
              value={code}
              onChange={setCode}
              onComplete={enable}
              disabled={enabling}
              ariaLabel="Confirmation code"
            />
            {error && (
              <div className="login-error" role="alert" style={{ marginTop: 16 }}>
                <Icon name="alert" size={15} />
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <Button type="button" variant="glass" onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                icon="shield"
                loading={enabling}
                disabled={code.length !== 6}
              >
                Confirm &amp; enable
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </Modal>
  )
}

function DisableTwoFactorModal({
  open,
  onClose,
  onDisabled,
}: {
  open: boolean
  onClose: () => void
  onDisabled: () => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    setCode('')
    setError(null)
    onClose()
  }

  async function disable(value: string) {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      await api.twoFactorDisable(value)
      onDisabled()
      close()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid code')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Disable two-factor"
      subtitle="Enter a current code to turn off 2FA"
      onClose={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (code.length === 6) disable(code)
        }}
      >
        <p className="tabhint" style={{ marginBottom: 14 }}>
          This removes the extra sign-in step. Enter a 6-digit code from your
          authenticator to confirm.
        </p>
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={disable}
          disabled={busy}
          ariaLabel="Disable confirmation code"
        />
        {error && (
          <div className="login-error" role="alert" style={{ marginTop: 16 }}>
            <Icon name="alert" size={15} />
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button type="button" variant="glass" onClick={close}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            icon="lock"
            loading={busy}
            disabled={code.length !== 6}
          >
            Disable 2FA
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function SecurityTab() {
  const { user, refreshUser } = useAuth()
  const [enableOpen, setEnableOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const enabled = !!user?.totpEnabled

  return (
    <>
      <div className="tabhead">
        <p className="tabhint">
          Protect your admin account with an extra step at sign-in.
        </p>
      </div>

      <Glass reveal style={{ padding: 20 }}>
        <div className="card-h" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <span
              className="twofa-ic"
              style={{ color: enabled ? 'var(--money)' : 'var(--gold)' }}
            >
              <Icon name="shield" size={22} />
            </span>
            <div>
              <h3 style={{ fontSize: 16 }}>Two-factor authentication</h3>
              <p className="tabhint" style={{ marginTop: 4 }}>
                Time-based one-time codes (TOTP) from an authenticator app such as
                Google Authenticator or 1Password.
              </p>
              <span className={`twofa-status ${enabled ? 'on' : ''}`}>
                <span className="dot" />
                {enabled ? 'Enabled' : 'Not enabled'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {enabled ? (
            <Button variant="danger" icon="lock" onClick={() => setDisableOpen(true)}>
              Disable 2FA
            </Button>
          ) : (
            <Button variant="primary" icon="shield" onClick={() => setEnableOpen(true)}>
              Enable 2FA
            </Button>
          )}
        </div>
      </Glass>

      <EnableTwoFactorModal
        open={enableOpen}
        onClose={() => setEnableOpen(false)}
        onEnabled={() => void refreshUser()}
      />
      <DisableTwoFactorModal
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        onDisabled={() => void refreshUser()}
      />
    </>
  )
}

/* ===================== Page ===================== */

const TABS: { id: Tab; label: string; icon: 'percent' | 'tag' | 'mail' | 'shield' }[] = [
  { id: 'tax', label: 'Tax rates', icon: 'percent' },
  { id: 'categories', label: 'Categories', icon: 'tag' },
  { id: 'templates', label: 'Templates', icon: 'mail' },
  { id: 'security', label: 'Security', icon: 'shield' },
]

export default function Settings() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('tax')
  const canEdit = user?.role === 'SUPER_ADMIN'

  return (
    <>
      <PageHeader
        crumb="Insights / Settings"
        title="Settings"
        sub={
          canEdit
            ? 'Tax rates, task categories and message templates'
            : 'Read-only · changes require Super Admin'
        }
      />

      {!canEdit && tab !== 'security' && (
        <div className="login-error" role="status" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={15} />
          You are viewing settings in read-only mode. Editing requires the SUPER_ADMIN role.
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tax' && <TaxRatesTab canEdit={canEdit} />}
      {tab === 'categories' && <CategoriesTab canEdit={canEdit} />}
      {tab === 'templates' && <TemplatesTab canEdit={canEdit} />}
      {tab === 'security' && <SecurityTab />}
    </>
  )
}
