
import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../../components/common/PageHeader'
import SearchInput from '../../components/common/SearchInput'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import EmptyState from '../../components/common/EmptyState'
import ContactFormModal from '../../components/common/ContactFormModal'
import Pagination from '../../components/common/Pagination'
import Modal from '../../components/common/Modal'
import Loading from '../../components/common/Loading'
import Icon from '../../components/common/Icon'
import { useDisclosure } from '../../hooks/useDisclosure'
import { usePermissions } from '../../hooks/usePermissions'
import { supplierService } from '../../services/supplierService'
import { formatCurrency, formatDateTime } from '../../utils/formatters'

const PAGE_SIZE = 6

const AVATAR_TONES = [
  'bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal',
  'bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber',
  'bg-rose-light dark:bg-dark-rose/15 text-rose dark:text-dark-rose',
  'bg-ink text-paper dark:bg-dark-border dark:text-dark-text',
]

function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

function toneFor(id) {
  const n = typeof id === 'number' ? id : String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_TONES[n % AVATAR_TONES.length]
}

/**
 * Suppliers — vendor directory + running ledger (FR: Supplier Ledgers).
 *
 * Premium pass: same lift + shine + glow treatment as Customers/Dashboard
 * (`.card-premium`, `.shine-sweep`, `.glow-teal`, `.table-premium`), a
 * company-initial avatar per row, and the ledger modal's balance/aging
 * figures now read as small tinted stat tiles instead of bare boxes so
 * the whole page feels like one consistent "alive" surface.
 */
export default function SuppliersPage() {
  const { has } = usePermissions()
  const canManage = has('SUPPLIERS_MANAGE')
  const [suppliers, setSuppliers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [activeSupplier, setActiveSupplier] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [ledgerSupplier, setLedgerSupplier] = useState(null)

  const formModal = useDisclosure()
  const confirmModal = useDisclosure()
  const ledgerModal = useDisclosure()

  async function loadSuppliers() {
    setIsLoading(true)
    try {
      const res = await supplierService.getAll()
      setSuppliers(res.data.data)
    } catch {
      setError('Could not load suppliers.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSuppliers()
  }, [])

  const filtered = useMemo(
    () => suppliers.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())),
    [suppliers, query],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function openCreate() {
    setActiveSupplier(null)
    formModal.open()
  }

  function openEdit(supplier) {
    setActiveSupplier(supplier)
    formModal.open()
  }

  function openLedger(supplier) {
    setLedgerSupplier(supplier)
    ledgerModal.open()
  }

  async function handleSave(values) {
    try {
      if (activeSupplier) {
        await supplierService.update(activeSupplier.id, values)
      } else {
        await supplierService.create(values)
      }
      formModal.close()
      await loadSuppliers()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    }
  }

  async function handleDelete() {
    try {
      await supplierService.remove(deleteTarget.id)
      setDeleteTarget(null)
      await loadSuppliers()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Manage the vendors you purchase stock from."
        action={
          canManage && (
            <button
              type="button"
              className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
              onClick={openCreate}
            >
              <Icon name="plus" className="h-4 w-4" />
              Add Supplier
            </button>
          )
        }
      />

      {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">{error}</p>}

      <div className="card card-premium glow-teal">
        <div className="p-4 border-b border-line dark:border-dark-border">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v)
              setPage(1)
            }}
            placeholder="Search suppliers…"
            className="max-w-xs"
          />
        </div>

        {isLoading ? (
          <Loading message="Loading suppliers…" />
        ) : paginated.length === 0 ? (
          <EmptyState
            title="No suppliers found"
            description="Try a different search, or add your first supplier."
            actionLabel={canManage ? 'Add Supplier' : undefined}
            onAction={canManage ? openCreate : undefined}
            icon="🚚"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((supplier) => (
                  <tr key={supplier.id} className="group">
                    <td>
                      <div className="flex items-center gap-3">
                        <span
                          className={`section-icon rounded-lg font-semibold text-xs ${toneFor(supplier.id)}`}
                        >
                          {initialsOf(supplier.name)}
                        </span>
                        <span className="font-medium">{supplier.name}</span>
                      </div>
                    </td>
                    <td className="figure text-ink-muted dark:text-dark-muted">{supplier.phone}</td>
                    <td className="text-ink-muted dark:text-dark-muted">{supplier.address || '—'}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost px-2.5 py-1.5 text-xs transition-all duration-200 hover:text-teal-dark dark:hover:text-dark-teal hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(47,111,107,0.25),0_4px_12px_-2px_rgba(47,111,107,0.25)] hover:-translate-y-0.5"
                          onClick={() => openLedger(supplier)}
                        >
                          <Icon name="chart" className="h-3.5 w-3.5" />
                          Ledger
                        </button>
                        {canManage && (
                          <button
                            type="button"
                            className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-ink dark:hover:text-dark-text hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(31,36,48,0.15),0_4px_12px_-2px_rgba(31,36,48,0.2)] dark:hover:shadow-[0_0_0_1px_rgba(231,229,221,0.12),0_4px_12px_-2px_rgba(0,0,0,0.5)] hover:-translate-y-0.5"
                            onClick={() => openEdit(supplier)}
                            aria-label={`Edit ${supplier.name}`}
                          >
                            <Icon name="edit" className="h-4 w-4" />
                          </button>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            className="btn-ghost px-2 py-1.5 transition-all duration-200 hover:text-rose dark:hover:text-dark-rose hover:bg-white dark:hover:bg-dark-card hover:shadow-[0_0_0_1px_rgba(193,80,46,0.3),0_4px_12px_-2px_rgba(193,80,46,0.3)] hover:-translate-y-0.5"
                            onClick={() => {
                              setDeleteTarget(supplier)
                              confirmModal.open()
                            }}
                            aria-label={`Delete ${supplier.name}`}
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <ContactFormModal
        isOpen={formModal.isOpen}
        onClose={formModal.close}
        onSave={handleSave}
        initialValues={activeSupplier}
        title={activeSupplier ? 'Edit Supplier' : 'Add Supplier'}
        entityLabel="Supplier"
      />

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={confirmModal.close}
        onConfirm={handleDelete}
        title="Delete supplier"
        message={`Delete "${deleteTarget?.name}"? This can't be undone.`}
      />

      <SupplierLedgerModal isOpen={ledgerModal.isOpen} onClose={ledgerModal.close} supplier={ledgerSupplier} />
    </div>
  )
}

const AGING_TILES = [
  { key: 'current', label: '0-30 days', tone: 'teal' },
  { key: 'days30', label: '31-60 days', tone: 'amber' },
  { key: 'days60', label: '61-90 days', tone: 'amber' },
  { key: 'over90', label: '90+ days', tone: 'rose' },
]

const AGING_TONE_CLASS = {
  teal: 'bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal ring-teal/20 dark:ring-dark-teal/20',
  amber: 'bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber ring-amber/25',
  rose: 'bg-rose-light dark:bg-dark-rose/15 text-rose dark:text-dark-rose ring-rose/25 dark:ring-dark-rose/25',
}

/**
 * FR: Supplier Ledgers — running balance, full entry history, an aging
 * breakdown of what's still unpaid, and a way to record a payment against
 * the balance.
 *
 * Premium pass: the balance summary is now a receipt-panel highlight (same
 * signature surface as the dashboard stat cards), each aging bucket is a
 * small tone-tinted tile that escalates teal → amber → rose the older the
 * debt gets, and the history table gets the shared `.table-premium` hover
 * treatment.
 */
function SupplierLedgerModal({ isOpen, onClose, supplier }) {
  const [ledger, setLedger] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function load() {
    if (!supplier) return
    setIsLoading(true)
    try {
      const res = await supplierService.getLedger(supplier.id)
      setLedger(res.data.data)
    } catch {
      setError('Could not load the ledger.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && supplier) {
      setError('')
      setAmount('')
      load()
    }
  }, [isOpen, supplier]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePayment(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) return
    setIsSubmitting(true)
    try {
      await supplierService.recordPayment(supplier.id, { amount: Number(amount), method })
      setAmount('')
      await load()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Ledger — ${supplier?.name || ''}`} size="lg">
      {isLoading ? (
        <Loading message="Loading ledger…" />
      ) : (
        <div className="space-y-5">
          {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2">{error}</p>}

          <div className="receipt-panel card-premium shine-sweep glow-teal flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="section-icon rounded-lg bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal">
                <Icon name="suppliers" className="h-4 w-4" />
              </span>
              <span className="text-sm text-ink-muted dark:text-dark-muted">Outstanding balance</span>
            </div>
            <span className="figure text-xl font-semibold text-ink dark:text-dark-text">
              {formatCurrency(ledger?.currentBalance || 0)}
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide mb-2">Aging</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {AGING_TILES.map(({ key, label, tone }) => (
                <div
                  key={key}
                  className={`rounded-lg px-2.5 py-2.5 text-center ring-1 ring-inset transition-transform duration-200 hover:-translate-y-0.5 ${AGING_TONE_CLASS[tone]}`}
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
                  <p className="figure text-sm font-semibold mt-0.5">{formatCurrency(ledger?.aging?.[key] || 0)}</p>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handlePayment} className="flex items-end gap-2 border-t border-line dark:border-dark-border pt-4">
            <div className="flex-1">
              <label className="label-text" htmlFor="ledger-amount">
                Record a payment
              </label>
              <input
                id="ledger-amount"
                type="number"
                min="0"
                step="0.01"
                className="input-field figure"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount"
              />
            </div>
            <select className="input-field w-40" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="UPI">UPI</option>
            </select>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-accent shrink-0 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
            >
              <Icon name="send" className="h-4 w-4" />
              {isSubmitting ? 'Saving…' : 'Record'}
            </button>
          </form>

          <div>
            <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide mb-2">History</p>
            {!ledger?.entries?.length ? (
              <p className="text-sm text-ink-muted dark:text-dark-muted">No purchases or payments recorded yet.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto">
                <table className="table-base table-premium">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.entries.map((e) => (
                      <tr key={e.id}>
                        <td className="text-ink-muted dark:text-dark-muted text-sm">{formatDateTime(e.date)}</td>
                        <td>
                          <span className={e.type === 'PURCHASE' ? 'badge-rose' : 'badge-teal'}>{e.type}</span>
                        </td>
                        <td className="figure">{formatCurrency(e.amount)}</td>
                        <td className="figure">{formatCurrency(e.balanceAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}


