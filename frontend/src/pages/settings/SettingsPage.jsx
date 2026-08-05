
import { useState, useEffect, useRef } from 'react'
import PageHeader from '../../components/common/PageHeader'
import Icon from '../../components/common/Icon'
import Loading from '../../components/common/Loading'
import { useTheme } from '../../hooks/useTheme'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { useCurrency } from '../../hooks/useCurrency'
import { CURRENCIES } from '../../utils/currency'
import { settingsService } from '../../services/settingsService'
import { toAssetUrl } from '../../utils/assetUrl'

/**
 * Settings — one editable business record (see BusinessSettings in
 * schema.prisma: a single row, not multi-tenant), plus the per-user
 * Appearance toggle and the full data backup export. Every logged-in
 * user can view this page; only SETTINGS_MANAGE can save changes,
 * upload a logo, or download a backup — the Save/Upload/Export
 * controls are simply hidden rather than disabled for anyone else, to
 * keep a mostly-read-only page uncluttered for non-admins.
 */
export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { refresh: refreshBusinessSettings } = useBusinessSettings()
  const { currencyCode, setCurrencyCode } = useCurrency()
  const logoInputRef = useRef(null)

  const [settings, setSettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isRemovingLogo, setIsRemovingLogo] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function load() {
    setIsLoading(true)
    settingsService
      .get()
      .then((res) => {
        setSettings(res.data.data)
        setForm(res.data.data)
      })
      .catch(() => setError('Could not load settings.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    setIsSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await settingsService.update({
        company_name: form.companyName,
        address: form.address,
        phone: form.phone,
        tax_id: form.taxId,
        invoice_footer_note: form.invoiceFooterNote,
        currency_symbol: form.currencySymbol,
        default_gst_rate: form.defaultGstRate,
        invoice_number_prefix: form.invoiceNumberPrefix,
        min_down_payment_pct: form.minDownPaymentPct,
        low_stock_alerts: form.lowStockAlerts,
        overdue_credit_alerts: form.overdueCreditAlerts,
        session_timeout_minutes: form.sessionTimeoutMinutes,
      })
      setSettings(res.data.data)
      setForm(res.data.data)
      setSuccess('Settings saved.')
      refreshBusinessSettings()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSaving(false)
    }
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingLogo(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('logo', file)
      const res = await settingsService.updateLogo(formData)
      setSettings(res.data.data)
      setForm(res.data.data)
      refreshBusinessSettings()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsUploadingLogo(false)
    }
    // Let the same file be re-selected later (e.g. remove then re-add
    // the exact same file) without the input silently no-op'ing.
    e.target.value = ''
  }

  async function handleLogoRemove() {
    setIsRemovingLogo(true)
    setError('')
    try {
      const res = await settingsService.removeLogo()
      setSettings(res.data.data)
      setForm(res.data.data)
      // Sidebar/LoginPage read logoUrl off this context — without the
      // refresh they'd keep showing the just-removed logo until the
      // next reload.
      refreshBusinessSettings()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsRemovingLogo(false)
    }
  }

  async function handleExport(format) {
    setIsExporting(true)
    setError('')
    try {
      const res = await settingsService.downloadBackup(format)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-${Date.now()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setError('Could not generate the backup file.')
    } finally {
      setIsExporting(false)
    }
  }

  if (isLoading || !form) return <Loading message="Loading settings…" />

  return (
    <div>
      <PageHeader title="Settings" subtitle="Business info, defaults, appearance, and backups." />

      {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">{error}</p>}
      {success && <p className="text-sm text-teal-dark dark:text-dark-teal bg-teal-light dark:bg-dark-teal/15 rounded-lg px-3 py-2 mb-4">{success}</p>}

      <div className="space-y-5">
        {/* Appearance */}
        <SettingsSection title="Appearance" icon="sun" tone="amber">
          <div className="flex gap-2 max-w-xs">
            {['LIGHT', 'DARK'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  theme === t ? 'bg-amber text-white' : 'bg-paper-dim dark:bg-dark-card2 text-ink-muted dark:text-dark-muted border border-line dark:border-dark-border'
                }`}
              >
                <Icon name={t === 'DARK' ? 'moon' : 'sun'} className="h-4 w-4" />
                {t === 'DARK' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-muted dark:text-dark-muted mt-2">Saved to your own account — everyone can pick their own.</p>
        </SettingsSection>

        {/* Business Info */}
        <SettingsSection title="Business Info" icon="warehouses" tone="teal">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-16 w-16 rounded-xl border-2 border-dashed border-line dark:border-dark-border bg-paper-dim dark:bg-dark-card2 flex items-center justify-center overflow-hidden shrink-0">
              {settings?.logoUrl ? (
                <img src={toAssetUrl(settings.logoUrl)} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                <Icon name="warehouses" className="h-6 w-6 text-ink-muted dark:text-dark-muted" />
              )}
            </div>
            <button type="button" className="btn-outline text-sm" onClick={() => logoInputRef.current?.click()} disabled={isUploadingLogo || isRemovingLogo}>
              {isUploadingLogo ? 'Uploading…' : settings?.logoUrl ? 'Change Logo' : 'Upload Logo'}
            </button>
            {settings?.logoUrl && (
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-rose dark:text-dark-rose hover:bg-rose-light dark:hover:bg-dark-rose/15 transition-colors disabled:opacity-60"
                onClick={handleLogoRemove}
                disabled={isUploadingLogo || isRemovingLogo}
              >
                <Icon name="trash" className="h-4 w-4" />
                {isRemovingLogo ? 'Removing…' : 'Remove Logo'}
              </button>
            )}
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company Name" value={form.companyName || ''} onChange={(v) => set('companyName', v)} />
            <Field label="Phone" value={form.phone || ''} onChange={(v) => set('phone', v)} />
            <Field label="Address" value={form.address || ''} onChange={(v) => set('address', v)} className="col-span-2" />
            <Field label="Tax ID / GSTIN" value={form.taxId || ''} onChange={(v) => set('taxId', v)} />
            <Field label="Invoice Footer Note" value={form.invoiceFooterNote || ''} onChange={(v) => set('invoiceFooterNote', v)} />
          </div>
        </SettingsSection>

        {/* Sales Defaults */}
        <SettingsSection title="Sales Defaults" icon="chart" tone="amber">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Default GST Rate (%)" type="number" value={form.defaultGstRate} onChange={(v) => set('defaultGstRate', v)} />
            <Field label="Invoice Number Prefix" value={form.invoiceNumberPrefix || ''} onChange={(v) => set('invoiceNumberPrefix', v)} />
            <Field
              label="Min. Down Payment for Installments (%)"
              type="number"
              value={form.minDownPaymentPct}
              onChange={(v) => set('minDownPaymentPct', v)}
            />
          </div>
        </SettingsSection>

        {/* General */}
        <SettingsSection title="General" icon="creditCard" tone="ink">
          <div className="max-w-xs">
            <label className="label-text" htmlFor="settings-currency">
              Display Currency
            </label>
            <select id="settings-currency" className="input-field" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
        </SettingsSection>

        {/* Notifications */}
        <SettingsSection title="Notifications" icon="bell" tone="rose">
          <div className="space-y-2">
            <Toggle label="Low stock alerts" checked={form.lowStockAlerts} onChange={(v) => set('lowStockAlerts', v)} />
            <Toggle label="Overdue credit alerts" checked={form.overdueCreditAlerts} onChange={(v) => set('overdueCreditAlerts', v)} />
          </div>
        </SettingsSection>

        {/* Security */}
        <SettingsSection title="Security" icon="key" tone="rose">
          <Field
            label="Session Timeout (minutes)"
            type="number"
            value={form.sessionTimeoutMinutes}
            onChange={(v) => set('sessionTimeoutMinutes', v)}
            className="max-w-xs"
          />
        </SettingsSection>

        <div className="flex justify-end">
          <button type="button" onClick={handleSave} disabled={isSaving} className="btn-accent disabled:opacity-60">
            {isSaving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>

        {/* Backup */}
        <SettingsSection title="Backup" icon="download" tone="teal">
          <p className="text-sm text-ink-muted dark:text-dark-muted mb-3">
            Export every record in the system — products, sales, customers, purchases, payroll, and audit logs — into
            one file.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-outline text-sm" disabled={isExporting} onClick={() => handleExport('excel')}>
              <Icon name="download" className="h-4 w-4" />
              {isExporting ? 'Generating…' : 'Export Excel'}
            </button>
            <button type="button" className="btn-outline text-sm" disabled={isExporting} onClick={() => handleExport('pdf')}>
              <Icon name="download" className="h-4 w-4" />
              {isExporting ? 'Generating…' : 'Export PDF'}
            </button>
          </div>
        </SettingsSection>
      </div>
    </div>
  )
}

function SettingsSection({ title, icon, tone = 'teal', children }) {
  const iconToneClass = {
    ink: 'bg-steel-light dark:bg-dark-steel/15 text-steel-dark dark:text-dark-steel',
    amber: 'bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber',
    teal: 'bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal',
    rose: 'bg-rose-light dark:bg-dark-rose/15 text-rose dark:text-dark-rose',
  }[tone]

  const glowToneClass = { ink: 'glow-ink', amber: 'glow-amber', teal: 'glow-teal', rose: 'glow-rose' }[tone]

  return (
    <div className={`card card-premium shine-sweep ${glowToneClass} p-5`}>
      <div className="flex items-center gap-2 mb-4">
        <span className={`section-icon ${iconToneClass}`}>
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">{title}</p>
      </div>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', className = '' }) {
  return (
    <div className={className}>
      <label className="label-text">{label}</label>
      <input type={type} className="input-field" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-ink dark:text-dark-text cursor-pointer">
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} className="rounded border-line dark:border-dark-border text-amber focus:ring-amber" />
      {label}
    </label>
  )
}


