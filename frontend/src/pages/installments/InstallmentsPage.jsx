import { useState, useEffect, useMemo } from 'react'
import PageHeader from '../../components/common/PageHeader'
import SearchInput from '../../components/common/SearchInput'
import Modal from '../../components/common/Modal'
import EmptyState from '../../components/common/EmptyState'
import Loading from '../../components/common/Loading'
import StatCard from '../../components/dashboard/StatCard'
import PaymentReceipt from '../../components/sales/PaymentReceipt'
import { useDisclosure } from '../../hooks/useDisclosure'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { installmentService } from '../../services/installmentService'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { downloadPaymentReceiptPdf } from '../../utils/receiptPdf'
import { printReceiptElement } from '../../utils/printReceipt'

/**
 * Installments — plans are created as part of POS checkout (see
 * CartPanel.jsx's Installments mode); this page is for everything after
 * that: browsing plans and marking each scheduled payment as it comes in.
 */
export default function InstallmentsPage() {
  const [plans, setPlans] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [activePlanId, setActivePlanId] = useState(null)

  const detailModal = useDisclosure()

  async function load() {
    setIsLoading(true)
    try {
      const res = await installmentService.getAll()
      setPlans(res.data.data)
    } catch {
      setError('Could not load installment plans.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo(() => {
    const active = plans.filter((p) => p.status === 'ACTIVE')
    const remaining = active.reduce((sum, p) => sum + p.installmentAmount * p.remainingCount, 0)
    const overdue = plans.filter((p) => p.installments?.some((i) => i.isOverdue))
    return { activeCount: active.length, completedCount: plans.filter((p) => p.status === 'COMPLETED').length, remaining, overdueCount: overdue.length }
  }, [plans])

  const filtered = plans.filter((p) => (p.customerName || '').toLowerCase().includes(query.toLowerCase()))

  function openDetail(planId) {
    setActivePlanId(planId)
    detailModal.open()
  }

  async function handleClose() {
    detailModal.close()
    await load()
  }

  return (
    <div data-keyboard-scope>
      <PageHeader title="Installments" subtitle="Plans created at checkout, and the schedule for each one." />

      {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Active Plans" value={stats.activeCount} icon="creditCard" tone="ink" />
          <StatCard label="Completed Plans" value={stats.completedCount} icon="checkCircle" tone="teal" />
          <StatCard label="Remaining to Collect" value={formatCurrency(stats.remaining)} icon="chart" tone="amber" highlight />
          <StatCard label="Plans with Overdue Installments" value={stats.overdueCount} icon="calendar" tone="rose" />
        </div>
      )}

      <div className="card card-premium shine-sweep glow-teal">
        <div className="p-4 border-b border-line dark:border-dark-border">
          <SearchInput value={query} onChange={setQuery} placeholder="Search by customer…" className="max-w-xs" />
        </div>

        {isLoading ? (
          <Loading message="Loading installment plans…" />
        ) : filtered.length === 0 ? (
          <EmptyState title="No installment plans yet" description="Started from POS checkout when a customer pays a down payment on a schedule." icon="📅" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Invoice</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Down Payment</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((plan) => (
                  <tr key={plan.id}>
                    <td className="font-medium">{plan.customerName}</td>
                    <td className="figure text-xs text-ink-muted dark:text-dark-muted">{plan.invoiceNumber}</td>
                    <td className="text-right figure">{formatCurrency(plan.totalAmount)}</td>
                    <td className="text-right figure">{formatCurrency(plan.downPayment)}</td>
                    <td className="figure text-sm">
                      {plan.paidCount} / {plan.installmentCount} paid
                    </td>
                    <td>
                      <span
                        className={
                          plan.status === 'COMPLETED' ? 'badge-teal' : plan.status === 'DEFAULTED' ? 'badge-rose' : 'badge-amber'
                        }
                      >
                        {plan.status}
                      </span>
                    </td>
                    <td className="text-right">
                      <button type="button" className="btn-outline !py-1 !px-2.5 text-xs" onClick={() => openDetail(plan.id)}>
                        View Schedule
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PlanDetailModal isOpen={detailModal.isOpen} onClose={handleClose} planId={activePlanId} />
    </div>
  )
}

function PlanDetailModal({ isOpen, onClose, planId }) {
  const [plan, setPlan] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [payingId, setPayingId] = useState(null)
  // Set right after a payment is recorded — replaces the schedule view
  // in-place with a printable sub-receipt for that one installment,
  // referencing the original checkout invoice. Cleared to go back to the
  // schedule (e.g. to mark the next installment too).
  const [receipt, setReceipt] = useState(null)
  const { companyName } = useBusinessSettings()

  function load() {
    if (!planId) return
    setIsLoading(true)
    installmentService
      .getById(planId)
      .then((res) => setPlan(res.data.data))
      .catch(() => setError('Could not load this plan.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    if (isOpen) {
      setReceipt(null)
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, planId])

  async function handlePay(installmentId) {
    setPayingId(installmentId)
    setError('')
    try {
      const res = await installmentService.payInstallment(planId, installmentId, { method: 'CASH' })
      setPlan(res.data.data.plan)
      setReceipt(res.data.data.payment)
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setPayingId(null)
    }
  }

  // PaymentReceipt only needs invoiceNumber/customer/total off the parent
  // invoice — the plan DTO already carries all three, so there's no need
  // for a second round-trip just to build that context.
  const receiptInvoice = plan ? { invoiceNumber: plan.invoiceNumber, customer: plan.customerName, total: plan.totalAmount } : null

  if (receipt && receiptInvoice) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Installment Receipt" size="sm">
        <div className="receipt-panel card-premium shine-sweep glow-teal p-6">
          <PaymentReceipt payment={receipt} invoice={receiptInvoice} />
        </div>
        <div className="flex gap-3 mt-4">
          <button type="button" className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5" onClick={() => printReceiptElement('payment-receipt-print-area')}>
            Print
          </button>
          <button
            type="button"
            className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5"
            onClick={() => downloadPaymentReceiptPdf(receipt, receiptInvoice, companyName)}
          >
            Download PDF
          </button>
        </div>
        <button type="button" className="btn-accent w-full mt-3 transition-all duration-200 hover:-translate-y-0.5" onClick={() => setReceipt(null)}>
          Back to Schedule
        </button>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={plan ? `Schedule — ${plan.customerName}` : 'Schedule'} size="md">
      {isLoading ? (
        <Loading message="Loading schedule…" />
      ) : plan ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-sm bg-paper-dim dark:bg-dark-card2 rounded-lg p-3">
            <div>
              <p className="text-ink-muted dark:text-dark-muted text-xs">Total</p>
              <p className="figure font-semibold text-ink dark:text-dark-text">{formatCurrency(plan.totalAmount)}</p>
            </div>
            <div>
              <p className="text-ink-muted dark:text-dark-muted text-xs">Down payment</p>
              <p className="figure font-semibold text-ink dark:text-dark-text">{formatCurrency(plan.downPayment)}</p>
            </div>
            <div>
              <p className="text-ink-muted dark:text-dark-muted text-xs">Per installment</p>
              <p className="figure font-semibold text-ink dark:text-dark-text">{formatCurrency(plan.installmentAmount)}</p>
            </div>
          </div>

          {error && <p className="text-xs text-rose dark:text-dark-rose">{error}</p>}

          <ul className="divide-y divide-line/70 dark:divide-dark-border/70">
            {plan.installments.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="text-sm font-medium text-ink dark:text-dark-text">
                    #{i.sequence} — {formatCurrency(i.amount)}
                  </p>
                  <p className={`text-xs ${i.isOverdue ? 'text-rose dark:text-dark-rose font-medium' : 'text-ink-muted dark:text-dark-muted'}`}>
                    Due {formatDate(i.dueDate)}
                    {i.isOverdue && ' (overdue)'}
                    {i.status === 'PAID' && ` — paid ${formatDate(i.paidDate)}`}
                  </p>
                </div>
                {i.status === 'PAID' ? (
                  <span className="badge-teal text-xs">Paid</span>
                ) : (
                  <button
                    type="button"
                    className="btn-accent !py-1 !px-3 text-xs"
                    disabled={payingId === i.id}
                    onClick={() => handlePay(i.id)}
                  >
                    {payingId === i.id ? 'Saving…' : 'Mark Paid'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-rose dark:text-dark-rose">{error || 'Not found.'}</p>
      )}
    </Modal>
  )
}
