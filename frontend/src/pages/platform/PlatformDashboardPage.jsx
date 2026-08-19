import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { platformBusinessService } from '../../services/platformBusinessService'
import { platformBillingService } from '../../services/platformBillingService'
import { toAssetUrl } from '../../utils/assetUrl'
import { isStandalonePwa } from '../../utils/pwa'
import Modal from '../../components/common/Modal'
import Badge from '../../components/common/Badge'
import Icon from '../../components/common/Icon'
import Loading from '../../components/common/Loading'
import EmptyState from '../../components/common/EmptyState'
import SearchInput from '../../components/common/SearchInput'
import Pagination from '../../components/common/Pagination'
import StatCard from '../../components/dashboard/StatCard'
import { useTheme } from '../../hooks/useTheme'
import ConfirmDialog from '../../components/common/ConfirmDialog'

const ALL_MODULES = {
  PRODUCTS: 'Products & Catalog',
  UNITS: 'Units of Measure',
  INVENTORY: 'Inventory & Warehouses',
  CONTACTS: 'Customers & Suppliers',
  SALES: 'Point of Sale & Invoices',
  PURCHASES: 'Purchases & Receiving',
  REPORTS: 'Reports & Dashboard',
  PAYROLL: 'Payroll',
  EXPENSES: 'Staff Expenses',
  CREDIT: 'Customer Credit',
  INSTALLMENTS: 'Installment Plans',
  KITS: 'Kits & Bundles',
  ADMIN: 'Users, Roles & Settings',
}

// Maps a business's status straight onto the shared Badge tones (same
// teal/amber/rose vocabulary as every other status badge in the app —
// see Badge.jsx) instead of the ad-hoc class strings this page used to
// hardcode.
const STATUS_TONE = { ACTIVE: 'teal', TRIAL: 'amber', SUSPENDED: 'rose' }

const PAGE_SIZE = 8

export default function PlatformDashboardPage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const admin = JSON.parse(localStorage.getItem('platform_admin') || 'null')

  const [businesses, setBusinesses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [industryFilter, setIndustryFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const [activeSection, setActiveSection] = useState('businesses')
  const [plans, setPlans] = useState([])
  const [payoutMethods, setPayoutMethods] = useState([])
  const [submissions, setSubmissions] = useState([])

  async function load() {
    setIsLoading(true)
    try {
      const { data } = await platformBusinessService.getAll()
      setBusinesses(data.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load businesses')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function loadBilling() {
    const [plansResponse, methodsResponse, submissionsResponse] = await Promise.all([
      platformBillingService.getPlans(),
      platformBillingService.getPayoutMethods(),
      platformBillingService.getSubmissions(),
    ])
    setPlans(plansResponse.data.data)
    setPayoutMethods(methodsResponse.data.data)
    setSubmissions(submissionsResponse.data.data)
  }

  useEffect(() => { loadBilling().catch((err) => setError(err.response?.data?.message || 'Failed to load billing data')) }, [])

  function handleLogout() {
    localStorage.removeItem('platform_token')
    localStorage.removeItem('platform_admin')
    navigate(isStandalonePwa() ? '/start' : '/platform/login', { replace: true })
  }

  async function handleStatusChange(id, status) {
    await platformBusinessService.setStatus(id, status)
    load()
  }

  // Platform-wide overview — every number here is derived client-side
  // from the same getAll() payload the list already uses (each business
  // already carries stats.users/stats.products — see business.service.js
  // toDTO), so this needs no new endpoint.
  const overview = useMemo(() => {
    const total = businesses.length
    const active = businesses.filter((b) => b.status === 'ACTIVE').length
    const trial = businesses.filter((b) => b.status === 'TRIAL').length
    const suspended = businesses.filter((b) => b.status === 'SUSPENDED').length
    const totalUsers = businesses.reduce((sum, b) => sum + (b.stats?.users || 0), 0)
    const totalProducts = businesses.reduce((sum, b) => sum + (b.stats?.products || 0), 0)
    return { total, active, trial, suspended, totalUsers, totalProducts }
  }, [businesses])

  const industries = useMemo(() => {
    const set = new Set(businesses.map((b) => b.industryType).filter(Boolean))
    return Array.from(set).sort()
  }, [businesses])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return businesses.filter((b) => {
      const matchesQuery = !q || b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter
      const matchesIndustry = industryFilter === 'ALL' || b.industryType === industryFilter
      return matchesQuery && matchesStatus && matchesIndustry
    })
  }, [businesses, query, statusFilter, industryFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div data-keyboard-scope className="min-h-screen bg-paper dark:bg-dark-surface">
      <header className="border-b border-line dark:border-dark-border bg-white dark:bg-dark-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="hidden sm:block w-1 h-9 rounded-full bg-gradient-to-b from-amber to-amber-dark shrink-0" />
          <div>
            <h1 className="font-display text-lg font-semibold text-ink dark:text-dark-text">Platform Admin</h1>
            <p className="text-xs text-ink-muted dark:text-dark-muted">Signed in as {admin?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Same toggle Navbar.jsx uses on every tenant page — reuses
              the already-global ThemeProvider (see main.jsx), no new
              provider needed here. */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg text-ink-muted dark:text-dark-muted hover:bg-paper-dim dark:hover:bg-dark-card2 hover:text-ink dark:hover:text-dark-text transition-colors"
            aria-label={theme === 'DARK' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'DARK' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <Icon name={theme === 'DARK' ? 'sun' : 'moon'} className="h-5 w-5" />
          </button>
          <button className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]" onClick={() => setShowCreateModal(true)}>
            <Icon name="plus" className="h-4 w-4" />
            New Business
          </button>
          <button className="btn-ghost" onClick={handleLogout}>Log out</button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto dashboard-ambient">
        {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">{error}</p>}

        {!isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-5 sm:mb-6">
            <StatCard label="Total Businesses" value={overview.total} icon="warehouses" tone="ink" />
            <StatCard label="Active" value={overview.active} icon="checkCircle" tone="teal" />
            <StatCard label="Trial" value={overview.trial} icon="calendar" tone="amber" highlight />
            <StatCard label="Suspended" value={overview.suspended} icon="close" tone="rose" />
            <StatCard label="Total Users" value={overview.totalUsers} icon="users" tone="ink" />
            <StatCard label="Total Products" value={overview.totalProducts} icon="products" tone="teal" />
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          {[
            ['businesses', 'Businesses'], ['plans', 'Plans'], ['payoutMethods', 'Payout Methods'], ['submissions', 'Payment Review'],
          ].map(([key, label]) => <button key={key} type="button" className={activeSection === key ? 'btn-accent' : 'btn-ghost'} onClick={() => setActiveSection(key)}>{label}</button>)}
        </div>

        {activeSection === 'businesses' && <div className="card card-premium glow-amber">
          <div className="p-4 border-b border-line dark:border-dark-border flex flex-col sm:flex-row gap-3">
            <SearchInput
              value={query}
              onChange={(v) => { setQuery(v); setPage(1) }}
              placeholder="Search by business name or slug…"
              className="max-w-xs"
            />
            <select
              className="input-field sm:max-w-[180px]"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="TRIAL">Trial</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
            {industries.length > 0 && (
              <select
                className="input-field sm:max-w-[200px]"
                value={industryFilter}
                onChange={(e) => { setIndustryFilter(e.target.value); setPage(1) }}
              >
                <option value="ALL">All industries</option>
                {industries.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            )}
          </div>

          {isLoading ? (
            <Loading message="Loading businesses…" />
          ) : paginated.length === 0 ? (
            <EmptyState
              title={businesses.length === 0 ? 'No businesses yet' : 'No businesses match your filters'}
              description={
                businesses.length === 0
                  ? 'Create the first one to get started.'
                  : 'Try a different search term, status, or industry.'
              }
              actionLabel={businesses.length === 0 ? 'New Business' : undefined}
              onAction={businesses.length === 0 ? () => setShowCreateModal(true) : undefined}
              icon="🏢"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base table-premium">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Status</th>
                    <th>Industry</th>
                    <th>Users</th>
                    <th>Products</th>
                    <th>Admin Seats</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((b) => (
                    <BusinessRow
                      key={b.id}
                      business={b}
                      isExpanded={expandedId === b.id}
                      onToggle={() => setExpandedId(expandedId === b.id ? null : b.id)}
                      onStatusChange={handleStatusChange}
                      onChanged={load}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>}
        {activeSection === 'plans' && <PlansSection plans={plans} onChanged={loadBilling} />}
        {activeSection === 'payoutMethods' && <PayoutMethodsSection methods={payoutMethods} onChanged={loadBilling} />}
        {activeSection === 'submissions' && <PaymentSubmissionsSection submissions={submissions} businesses={businesses} onChanged={loadBilling} />}
      </main>

      {showCreateModal && (
        <CreateBusinessModal
          plans={plans.filter((plan) => plan.isActive)}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); load() }}
        />
      )}
    </div>
  )
}

/** One row in the business table, plus its expandable manage panel. */
function BusinessRow({ business: b, isExpanded, onToggle, onStatusChange, onChanged }) {
  return (
    <>
      <tr className="group">
        <td>
          <div className="flex items-center gap-3">
            <span className="section-icon bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
              <Icon name="warehouses" className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <span className="font-medium block transition-colors duration-200 group-hover:text-amber-dark dark:group-hover:text-amber">
                {b.name}
              </span>
              <span className="text-xs text-ink-muted dark:text-dark-muted figure">{b.slug}</span>
            </div>
          </div>
        </td>
        <td><Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge></td>
        <td className="text-ink-muted dark:text-dark-muted">{b.industryType || '—'}</td>
        <td className="figure">{b.stats?.users ?? 0}</td>
        <td className="figure">{b.stats?.products ?? 0}</td>
        <td className="figure text-ink-muted dark:text-dark-muted">{b.maxAdminSeats ?? 'No limit'}</td>
        <td>
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-ghost text-sm transition-all duration-200 hover:text-ink dark:hover:text-dark-text hover:bg-white dark:hover:bg-dark-card hover:-translate-y-0.5"
              onClick={onToggle}
            >
              {isExpanded ? 'Close' : 'Manage'}
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="p-0 border-b border-line dark:border-dark-border">
            <BusinessDetail business={b} onStatusChange={onStatusChange} onChanged={onChanged} />
          </td>
        </tr>
      )}
    </>
  )
}

function BusinessDetail({ business, onStatusChange, onChanged }) {
  const [modules, setModules] = useState(business.enabledModules || [])
  const [maxSeats, setMaxSeats] = useState(business.maxAdminSeats ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('teal')

  const [infoForm, setInfoForm] = useState({
    name: business.name,
    industryType: business.industryType || '',
    contactEmail: business.contactEmail || '',
    contactPhone: business.contactPhone || '',
  })

  function say(text, tone = 'teal') {
    setMessage(text)
    setMessageTone(tone)
  }

  function toggleModule(key) {
    setModules((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]))
  }

  async function saveInfo() {
    if (!infoForm.name.trim()) {
      say('Business name cannot be empty.', 'rose')
      return
    }
    try {
      await platformBusinessService.updateInfo(business.id, infoForm)
      say('Business info updated.')
      onChanged()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    }
  }

  async function saveModules() {
    await platformBusinessService.setModules(business.id, modules)
    say('Modules updated.')
    onChanged()
  }

  async function saveMaxSeats() {
    await platformBusinessService.setMaxAdminSeats(business.id, maxSeats === '' ? null : Number(maxSeats))
    say('Admin seat limit updated.')
    onChanged()
  }

  async function resetPassword() {
    if (!newPassword || newPassword.length < 6) {
      say('New password must be at least 6 characters.', 'rose')
      return
    }
    const { data } = await platformBusinessService.resetAdminPassword(business.id, newPassword)
    say(`Password reset for ${data.data.email}.`)
    setNewPassword('')
  }

  return (
    <div className="bg-paper-dim/60 dark:bg-dark-card2/40 p-5 space-y-6">
      {message && (
        <p className={messageTone === 'rose' ? 'text-sm text-rose dark:text-dark-rose' : 'text-sm text-teal dark:text-dark-teal'}>
          {message}
        </p>
      )}

      {/* Business info — the fields captured when this business was first
          created (see CreateBusinessModal). Slug is deliberately not
          editable here (kept immutable). */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <span className="section-icon bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
            <Icon name="calendar" className="h-3.5 w-3.5" />
          </span>
          <label className="label-text mb-0">Current subscription</label>
        </div>
        {business.subscription ? (
          <div className="rounded-lg border border-line dark:border-dark-border bg-white/60 dark:bg-dark-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink dark:text-dark-text">{business.subscription.plan.name}</span>
              <Badge tone={business.subscription.status === 'ACTIVE' ? 'teal' : business.subscription.status === 'SUSPENDED' ? 'rose' : 'amber'}>{business.subscription.status}</Badge>
              <span className="text-ink-muted dark:text-dark-muted">{business.subscription.plan.billingCycle} · {business.subscription.plan.price}</span>
            </div>
            <p className="mt-1 text-ink-muted dark:text-dark-muted">Current period ends {new Date(business.subscription.currentPeriodEnd).toLocaleDateString()}. Plan changes happen when a payment submission is approved.</p>
          </div>
        ) : <p className="text-sm text-rose">No subscription record exists for this business.</p>}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2">
          <span className="section-icon bg-steel-light dark:bg-dark-steel/15 text-steel dark:text-dark-steel">
            <Icon name="edit" className="h-3.5 w-3.5" />
          </span>
          <label className="label-text mb-0">Business info</label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label-text" htmlFor={`biz-name-${business.id}`}>Business name</label>
            <input
              id={`biz-name-${business.id}`}
              className="input-field"
              value={infoForm.name}
              onChange={(e) => setInfoForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label-text" htmlFor={`biz-industry-${business.id}`}>Industry</label>
            <input
              id={`biz-industry-${business.id}`}
              className="input-field"
              value={infoForm.industryType}
              onChange={(e) => setInfoForm((prev) => ({ ...prev, industryType: e.target.value }))}
              placeholder="e.g. Mobile Shop, Sanitaryware"
            />
          </div>
          <div>
            <label className="label-text" htmlFor={`biz-email-${business.id}`}>Contact email</label>
            <input
              id={`biz-email-${business.id}`}
              className="input-field"
              value={infoForm.contactEmail}
              onChange={(e) => setInfoForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
            />
          </div>
          <div>
            <label className="label-text" htmlFor={`biz-phone-${business.id}`}>Contact phone</label>
            <input
              id={`biz-phone-${business.id}`}
              className="input-field"
              value={infoForm.contactPhone}
              onChange={(e) => setInfoForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
            />
          </div>
        </div>
        <button className="btn-accent text-sm mt-3" onClick={saveInfo}>Save business info</button>
      </section>

      <hr className="border-line dark:border-dark-border" />

      <section>
        <label className="label-text">Business status</label>
        <div className="flex gap-2 mt-1">
          {['TRIAL', 'ACTIVE', 'SUSPENDED'].map((s) => (
            <button
              key={s}
              type="button"
              className={`btn-ghost text-sm ${business.status === s ? 'ring-2 ring-amber' : ''}`}
              onClick={() => onStatusChange(business.id, s)}
            >
              {s}
            </button>
          ))}
        </div>
        {business.status === 'SUSPENDED' && (
          <p className="text-xs text-ink-muted dark:text-dark-muted mt-1">
            Every user at this business — including its primary admin — is blocked from logging in while suspended.
          </p>
        )}
      </section>

      <section>
        <label className="label-text">Enabled modules</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
          {Object.entries(ALL_MODULES).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-ink dark:text-dark-text">
              <input type="checkbox" checked={modules.includes(key)} onChange={() => toggleModule(key)} />
              {label}
            </label>
          ))}
        </div>
        <button className="btn-accent text-sm mt-2" onClick={saveModules}>Save modules</button>
      </section>

      <div className="flex flex-wrap items-end gap-6">
        <div className="flex items-end gap-2">
          <div>
            <label className="label-text">Max admin seats</label>
            <input
              type="number"
              min="0"
              value={maxSeats}
              onChange={(e) => setMaxSeats(e.target.value)}
              placeholder="No limit"
              className="input-field w-40"
            />
          </div>
          <button className="btn-ghost text-sm" onClick={saveMaxSeats}>Save</button>
        </div>

        <div className="flex items-end gap-2">
          <div>
            <label className="label-text">Reset primary admin password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="input-field w-56"
            />
          </div>
          <button className="btn-ghost text-sm" onClick={resetPassword}>Reset</button>
        </div>
      </div>
    </div>
  )
}

function CreateBusinessModal({ plans, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', industryType: '', contactEmail: '', contactPhone: '',
    adminName: '', adminEmail: '', adminPassword: '', planId: '',
  })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name || !form.adminName || !form.adminEmail || !form.adminPassword || !form.planId) {
      setError('Business name, starting plan, admin name, admin email and admin password are required.')
      return
    }
    setIsSubmitting(true)
    try {
      await platformBusinessService.create(form)
      onCreated()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Create a new business" size="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="label-text">Business name</label>
          <input className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} />
        </div>
        <div>
          <label className="label-text">Industry (optional)</label>
          <input className="input-field" value={form.industryType} onChange={(e) => update('industryType', e.target.value)} placeholder="e.g. Mobile Shop, Sanitaryware" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text">Contact email</label>
            <input className="input-field" value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} />
          </div>
          <div>
            <label className="label-text">Contact phone</label>
            <input className="input-field" value={form.contactPhone} onChange={(e) => update('contactPhone', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label-text">Starting plan</label>
          <select required className="input-field" value={form.planId} onChange={(e) => update('planId', e.target.value)}>
            <option value="">Choose an active plan</option>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {plan.price} / {plan.billingCycle.toLowerCase()} ({plan.trialPeriodDays} trial days)</option>)}
          </select>
          <p className="text-xs text-ink-muted dark:text-dark-muted mt-1">The plan sets this business’s initial modules, seat limit, and trial period.</p>
        </div>

        <hr className="border-line dark:border-dark-border" />
        <p className="text-sm font-medium text-ink dark:text-dark-text">First (primary admin) login</p>

        <div>
          <label className="label-text">Admin name</label>
          <input className="input-field" value={form.adminName} onChange={(e) => update('adminName', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text">Admin email</label>
            <input type="email" className="input-field" value={form.adminEmail} onChange={(e) => update('adminEmail', e.target.value)} />
          </div>
          <div>
            <label className="label-text">Admin password</label>
            <input type="password" className="input-field" value={form.adminPassword} onChange={(e) => update('adminPassword', e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-rose">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={isSubmitting} className="btn-accent">
            {isSubmitting ? 'Creating…' : 'Create business'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PlansSection({ plans, onChanged }) {
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  return <section className="card card-premium p-5"><div className="flex justify-between items-center mb-4"><div><h2 className="font-display text-lg font-semibold">Plans</h2><p className="text-sm text-ink-muted dark:text-dark-muted">Pricing and default business access.</p></div><button className="btn-accent" onClick={() => setEditing({})}>New plan</button></div><div className="overflow-x-auto"><table className="table-base"><thead><tr><th>Name</th><th>Price</th><th>Cycle</th><th>Trial</th><th>Seats</th><th>Status</th><th /></tr></thead><tbody>{plans.map((plan) => <tr key={plan.id}><td>{plan.name}</td><td>{plan.price}</td><td>{plan.billingCycle}</td><td>{plan.trialPeriodDays} days</td><td>{plan.defaultMaxAdminSeats ?? 'No limit'}</td><td><Badge tone={plan.isActive ? 'teal' : 'rose'}>{plan.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge></td><td className="text-right"><button className="btn-ghost text-sm" onClick={() => setEditing(plan)}>Edit</button>{plan.isActive && <button className="btn-ghost text-sm text-rose" onClick={() => setConfirm(plan)}>Deactivate</button>}</td></tr>)}</tbody></table></div>{editing && <PlanModal plan={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onChanged() }} />}{confirm && <ConfirmDialog isOpen onClose={() => setConfirm(null)} onConfirm={() => platformBillingService.deactivatePlan(confirm.id).then(onChanged)} title="Deactivate plan?" message="Historical subscriptions keep this plan, but it cannot be assigned again." confirmLabel="Deactivate" />}</section>
}

function PlanModal({ plan, onClose, onSaved }) {
  const [form, setForm] = useState({ name: plan.name || '', price: plan.price || '', billingCycle: plan.billingCycle || 'MONTHLY', trialPeriodDays: plan.trialPeriodDays ?? 14, defaultEnabledModules: plan.defaultEnabledModules || Object.keys(ALL_MODULES), defaultMaxAdminSeats: plan.defaultMaxAdminSeats ?? '' })
  const save = async (event) => { event.preventDefault(); const data = { ...form, price: Number(form.price), trialPeriodDays: Number(form.trialPeriodDays), defaultMaxAdminSeats: form.defaultMaxAdminSeats === '' ? null : Number(form.defaultMaxAdminSeats) }; if (plan.id) await platformBillingService.updatePlan(plan.id, data); else await platformBillingService.createPlan(data); onSaved() }
  const toggle = (key) => setForm((current) => ({ ...current, defaultEnabledModules: current.defaultEnabledModules.includes(key) ? current.defaultEnabledModules.filter((item) => item !== key) : [...current.defaultEnabledModules, key] }))
  return <Modal isOpen onClose={onClose} title={plan.id ? 'Edit plan' : 'Create plan'} size="lg"><form onSubmit={save} className="space-y-3"><input required className="input-field" placeholder="Plan name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><div className="grid grid-cols-3 gap-3"><input required className="input-field" type="number" min="0" step="0.01" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /><select className="input-field" value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select><input className="input-field" type="number" min="0" placeholder="Trial days" value={form.trialPeriodDays} onChange={(e) => setForm({ ...form, trialPeriodDays: e.target.value })} /></div><input className="input-field" type="number" min="0" placeholder="Max admin seats (blank = no limit)" value={form.defaultMaxAdminSeats} onChange={(e) => setForm({ ...form, defaultMaxAdminSeats: e.target.value })} /><div className="grid grid-cols-2 gap-2">{Object.entries(ALL_MODULES).map(([key, label]) => <label key={key} className="text-sm"><input type="checkbox" checked={form.defaultEnabledModules.includes(key)} onChange={() => toggle(key)} /> {label}</label>)}</div><div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-accent">Save plan</button></div></form></Modal>
}

function PayoutMethodsSection({ methods, onChanged }) {
  const [editing, setEditing] = useState(null); const [confirm, setConfirm] = useState(null)
  return <section className="card card-premium p-5"><div className="flex justify-between items-center mb-4"><div><h2 className="font-display text-lg font-semibold">Payout Methods</h2><p className="text-sm text-ink-muted dark:text-dark-muted">Payment destinations shown to businesses.</p></div><button className="btn-accent" onClick={() => setEditing({})}>New method</button></div>{methods.map((method) => <div key={method.id} className="flex justify-between items-center border-t border-line dark:border-dark-border py-3"><div><p className="font-medium">{method.label} <Badge tone={method.isActive ? 'teal' : 'rose'}>{method.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge></p><p className="text-sm text-ink-muted">{method.type} · {method.accountTitle} · {method.accountNumber}</p></div><div><button className="btn-ghost text-sm" onClick={() => setEditing(method)}>Edit</button>{method.isActive && <button className="btn-ghost text-sm text-rose" onClick={() => setConfirm(method)}>Deactivate</button>}</div></div>)}{editing && <PayoutMethodModal method={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onChanged() }} />}{confirm && <ConfirmDialog isOpen onClose={() => setConfirm(null)} onConfirm={() => platformBillingService.deactivatePayoutMethod(confirm.id).then(onChanged)} title="Deactivate payout method?" message="It remains visible on historical submissions." confirmLabel="Deactivate" />}</section>
}

function PayoutMethodModal({ method, onClose, onSaved }) {
  const [form, setForm] = useState({ label: method.label || '', type: method.type || 'BANK_TRANSFER', accountTitle: method.accountTitle || '', accountNumber: method.accountNumber || '', instructions: method.instructions || '' }); const save = async (event) => { event.preventDefault(); if (method.id) await platformBillingService.updatePayoutMethod(method.id, form); else await platformBillingService.createPayoutMethod(form); onSaved() }
  return <Modal isOpen onClose={onClose} title={method.id ? 'Edit payout method' : 'Create payout method'}><form onSubmit={save} className="space-y-3"><input required className="input-field" placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /><select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{['BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA', 'OTHER'].map((type) => <option key={type}>{type}</option>)}</select><input required className="input-field" placeholder="Account title" value={form.accountTitle} onChange={(e) => setForm({ ...form, accountTitle: e.target.value })} /><input required className="input-field" placeholder="Account number / IBAN" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /><textarea className="input-field" placeholder="Instructions" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /><div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-accent">Save method</button></div></form></Modal>
}

function PaymentSubmissionsSection({ submissions, businesses, onChanged }) {
  const [status, setStatus] = useState('ALL'); const [businessId, setBusinessId] = useState(''); const [reason, setReason] = useState({}); const [previewUrl, setPreviewUrl] = useState(null); const filtered = submissions.filter((item) => (status === 'ALL' || item.status === status) && (!businessId || item.business?.id === businessId)); const reject = async (id) => { if (!reason[id]?.trim()) return; await platformBillingService.rejectSubmission(id, reason[id]); await onChanged() }
  const handleOpenScreenshot = (e, url) => {
    if (isStandalonePwa()) {
      e.preventDefault()
      setPreviewUrl(url)
    }
  }
  return <section className="card card-premium p-5"><div className="flex flex-wrap justify-between gap-3 mb-4"><div><h2 className="font-display text-lg font-semibold">Payment Review</h2><p className="text-sm text-ink-muted">Approve valid proof to reactivate or extend a subscription.</p></div><div className="flex gap-2"><select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select><select className="input-field" value={businessId} onChange={(e) => setBusinessId(e.target.value)}><option value="">All businesses</option>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></div></div>{filtered.map((item) => <div key={item.id} className="border-t border-line dark:border-dark-border py-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-medium">{item.business?.name} · {item.plan?.name}</p><p className="text-sm text-ink-muted">{item.amount} via {item.payoutMethod?.label} · {new Date(item.createdAt).toLocaleString()}</p>{item.referenceNote && <p className="text-sm">{item.referenceNote}</p>}<a href={toAssetUrl(item.screenshotUrl)} onClick={(e) => handleOpenScreenshot(e, toAssetUrl(item.screenshotUrl))} target="_blank" rel="noreferrer" className="text-sm text-amber-dark underline cursor-pointer">View screenshot</a></div><Badge tone={item.status === 'APPROVED' ? 'teal' : item.status === 'REJECTED' ? 'rose' : 'amber'}>{item.status}</Badge></div>{item.status === 'PENDING' && <div className="flex flex-wrap gap-2 mt-3"><button className="btn-accent text-sm" onClick={() => platformBillingService.approveSubmission(item.id).then(onChanged)}>Approve</button><input className="input-field max-w-xs" placeholder="Required rejection reason" value={reason[item.id] || ''} onChange={(e) => setReason({ ...reason, [item.id]: e.target.value })} /><button className="btn-ghost text-sm text-rose" onClick={() => reject(item.id)}>Reject</button></div>}{item.rejectionReason && <p className="text-sm text-rose mt-2">Reason: {item.rejectionReason}</p>}</div>)}
    {previewUrl && (
      <Modal isOpen={!!previewUrl} onClose={() => setPreviewUrl(null)} title="Payment Screenshot" size="lg">
        <div className="flex flex-col items-center justify-center">
          <div className="max-h-[65vh] w-full overflow-hidden rounded-xl border border-line dark:border-dark-border bg-paper-dim/40 dark:bg-dark-card2 flex items-center justify-center p-3">
            <img src={previewUrl} alt="Payment Screenshot" className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-sm" />
          </div>
          <div className="mt-4 flex justify-end w-full">
            <button type="button" onClick={() => setPreviewUrl(null)} className="btn-primary">
              Close
            </button>
          </div>
        </div>
      </Modal>
    )}
  </section>
}
