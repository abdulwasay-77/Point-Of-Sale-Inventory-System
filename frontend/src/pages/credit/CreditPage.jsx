import { useState, useEffect, useMemo } from 'react'
import PageHeader from '../../components/common/PageHeader'
import SearchInput from '../../components/common/SearchInput'
import Modal from '../../components/common/Modal'
import EmptyState from '../../components/common/EmptyState'
import Loading from '../../components/common/Loading'
import StatCard from '../../components/dashboard/StatCard'
import PaymentReceipt from '../../components/sales/PaymentReceipt'
import InvoiceReceipt from '../../components/sales/InvoiceReceipt'
import { useDisclosure } from '../../hooks/useDisclosure'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { creditService } from '../../services/creditService'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { downloadPaymentReceiptPdf, downloadReceiptPdf } from '../../utils/receiptPdf'
import { printReceiptElement } from '../../utils/printReceipt'

/**
 * CustomerCredit — a view over invoices that still have balance_due > 0
 * (set at POS checkout when a customer pays part now, part later — see
 * CartPanel.jsx's Credit mode). There's no separate "credit record" —
 * this reads and acts on the invoice itself, same source of truth POS
 * and Sales History use.
 */
export default function CreditPage() {
  const [tab, setTab] = useState('outstanding') // 'outstanding' | 'in-progress' | 'history'
  const [invoices, setInvoices] = useState([])
  const [history, setHistory] = useState([])
  const [inProgress, setInProgress] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [isInProgressLoading, setIsInProgressLoading] = useState(false)
  const [inProgressLoaded, setInProgressLoaded] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [activeInvoice, setActiveInvoice] = useState(null)
  const [actionType, setActionType] = useState(null) // 'payment' | 'late-fee'

  const actionModal = useDisclosure()

  async function load() {
    setIsLoading(true)
    try {
      const res = await creditService.getOutstanding()
      setInvoices(res.data.data)
    } catch {
      setError('Could not load outstanding balances.')
    } finally {
      setIsLoading(false)
    }
  }

  async function loadHistory() {
    setIsHistoryLoading(true)
    try {
      const res = await creditService.getHistory()
      setHistory(res.data.data)
      setHistoryLoaded(true)
    } catch {
      setError('Could not load credit history.')
    } finally {
      setIsHistoryLoading(false)
    }
  }

  // In Progress — every partial payment against an invoice that's still
  // outstanding (some money in, balance remaining) with its own date,
  // separate from the invoice-level Outstanding view above.
  async function loadInProgress() {
    setIsInProgressLoading(true)
    try {
      const res = await creditService.getInProgress()
      setInProgress(res.data.data)
      setInProgressLoaded(true)
    } catch {
      setError('Could not load partial payments.')
    } finally {
      setIsInProgressLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // History and In Progress are loaded lazily — only once their tab is
  // actually opened, and only the first time (subsequent switches reuse
  // what's already there; action modals refresh whichever is loaded
  // directly when something changes).
  useEffect(() => {
    if (tab === 'history' && !historyLoaded) loadHistory()
    if (tab === 'in-progress' && !inProgressLoaded) loadInProgress()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const stats = useMemo(() => {
    const totalDue = invoices.reduce((sum, i) => sum + i.balanceDue, 0)
    const overdueCount = invoices.filter((i) => i.isOverdue).length
    const overdueAmount = invoices.filter((i) => i.isOverdue).reduce((sum, i) => sum + i.balanceDue, 0)
    return { count: invoices.length, totalDue, overdueCount, overdueAmount }
  }, [invoices])

  const filteredOutstanding = invoices.filter((i) => (i.customerName || '').toLowerCase().includes(query.toLowerCase()))
  const filteredHistory = history.filter((i) => (i.customerName || '').toLowerCase().includes(query.toLowerCase()))
  const filteredInProgress = inProgress.filter((i) => (i.customerName || '').toLowerCase().includes(query.toLowerCase()))

  function openAction(invoice, type) {
    setActiveInvoice(invoice)
    setActionType(type)
    actionModal.open()
  }

  async function refreshLists() {
    await load()
    if (historyLoaded) await loadHistory()
    if (inProgressLoaded) await loadInProgress()
  }

  async function handleClose() {
    actionModal.close()
    await refreshLists()
  }

  return (
    <div>
      <PageHeader title="Customer Credit" subtitle="Every sale still carrying a balance — who owes what, and since when." />

      {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Accounts Owing" value={stats.count} icon="creditCard" tone="ink" />
          <StatCard label="Total Outstanding" value={formatCurrency(stats.totalDue)} icon="chart" tone="amber" highlight />
          <StatCard label="Overdue Accounts" value={stats.overdueCount} icon="calendar" tone="rose" />
          <StatCard label="Overdue Amount" value={formatCurrency(stats.overdueAmount)} icon="creditCard" tone="rose" />
        </div>
      )}

      <div className="card card-premium shine-sweep glow-amber">
        <div className="flex items-center justify-between gap-4 p-4 border-b border-line dark:border-dark-border flex-wrap">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTab('outstanding')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'outstanding' ? 'bg-amber text-white' : 'text-ink-muted dark:text-dark-muted hover:bg-paper-dim dark:hover:bg-dark-card2'
              }`}
            >
              Outstanding
            </button>
            <button
              type="button"
              onClick={() => setTab('in-progress')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'in-progress' ? 'bg-amber text-white' : 'text-ink-muted dark:text-dark-muted hover:bg-paper-dim dark:hover:bg-dark-card2'
              }`}
            >
              In Progress
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'history' ? 'bg-amber text-white' : 'text-ink-muted dark:text-dark-muted hover:bg-paper-dim dark:hover:bg-dark-card2'
              }`}
            >
              History
            </button>
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="Search by customer…" className="max-w-xs" />
        </div>

        {tab === 'outstanding' ? (
          isLoading ? (
            <Loading message="Loading outstanding balances…" />
          ) : filteredOutstanding.length === 0 ? (
            <EmptyState title="No outstanding balances" description="Every sale is fully paid — nothing owed right now." icon="✅" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base table-premium">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Invoice</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Due</th>
                    <th>Due Date</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOutstanding.map((inv) => (
                    <tr key={inv.id} className={inv.isOverdue ? 'bg-rose-light/20 dark:bg-dark-rose/15' : ''}>
                      <td className="font-medium">{inv.customerName}</td>
                      <td className="text-ink-muted dark:text-dark-muted">{inv.customerType}</td>
                      <td>
                        <span className="figure text-xs text-ink-muted dark:text-dark-muted">{inv.invoiceNumber}</span>
                        {inv.invoiceType === 'LATE_FEE' && <span className="badge-rose text-[10px] ml-1.5">Late fee</span>}
                      </td>
                      <td className="text-right figure">{formatCurrency(inv.amountPaid)}</td>
                      <td className="text-right figure font-semibold text-rose dark:text-dark-rose">{formatCurrency(inv.balanceDue)}</td>
                      <td>
                        {inv.dueDate ? (
                          <span className={inv.isOverdue ? 'text-rose dark:text-dark-rose font-medium' : 'text-ink-muted dark:text-dark-muted'}>
                            {formatDate(inv.dueDate)} {inv.isOverdue && '(overdue)'}
                          </span>
                        ) : (
                          <span className="text-ink-muted dark:text-dark-muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button type="button" className="btn-outline !py-1 !px-2.5 text-xs" onClick={() => openAction(inv, 'payment')}>
                            Record Payment
                          </button>
                          {inv.invoiceType === 'SALE' && (
                            <button type="button" className="btn-outline !py-1 !px-2.5 text-xs" onClick={() => openAction(inv, 'late-fee')}>
                              Late Fee
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'in-progress' ? (
          isInProgressLoading ? (
            <Loading message="Loading partial payments…" />
          ) : filteredInProgress.length === 0 ? (
            <EmptyState
              title="No partial payments yet"
              description="Once a customer pays part of what they owe before clearing the full amount, each payment shows up here with its date and what's left."
              icon="⏳"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base table-premium">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Invoice</th>
                    <th className="text-right">Total Due</th>
                    <th className="text-right">Partial Payment</th>
                    <th>Partial Payment Date</th>
                    <th className="text-right">Remaining</th>
                    <th>Actual Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInProgress.map((row) => (
                    <tr key={row.id} className={row.isOverdue ? 'bg-rose-light/20 dark:bg-dark-rose/15' : ''}>
                      <td className="font-medium">{row.customerName}</td>
                      <td>
                        <span className="figure text-xs text-ink-muted dark:text-dark-muted">{row.invoiceNumber}</span>
                      </td>
                      <td className="text-right figure">{formatCurrency(row.totalDue)}</td>
                      <td className="text-right figure font-semibold text-teal dark:text-dark-teal">{formatCurrency(row.partialPayment)}</td>
                      <td className="text-ink-muted dark:text-dark-muted">
                        {formatDate(row.partialPaymentDate)}
                        {row.actualDueDate && new Date(row.partialPaymentDate) < new Date(row.actualDueDate) && (
                          <span className="badge-teal text-[10px] ml-1.5">Early</span>
                        )}
                      </td>
                      <td className="text-right figure font-semibold text-rose dark:text-dark-rose">{formatCurrency(row.remaining)}</td>
                      <td>
                        {row.actualDueDate ? (
                          <span className={row.isOverdue ? 'text-rose dark:text-dark-rose font-medium' : 'text-ink-muted dark:text-dark-muted'}>
                            {formatDate(row.actualDueDate)} {row.isOverdue && '(overdue)'}
                          </span>
                        ) : (
                          <span className="text-ink-muted dark:text-dark-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : isHistoryLoading ? (
          <Loading message="Loading credit history…" />
        ) : filteredHistory.length === 0 ? (
          <EmptyState title="No credit history yet" description="Every credit sale ever made shows up here, paid off or not." icon="🕘" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Invoice</th>
                  <th className="text-right">Total Paid</th>
                  <th>Status</th>
                  <th>Settled On</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-medium">{inv.customerName}</td>
                    <td>
                      <span className="figure text-xs text-ink-muted dark:text-dark-muted">{inv.invoiceNumber}</span>
                      {inv.invoiceType === 'LATE_FEE' && <span className="badge-rose text-[10px] ml-1.5">Late fee</span>}
                    </td>
                    <td className="text-right figure">{formatCurrency(inv.amountPaid)}</td>
                    <td>
                      {inv.balanceDue === 0 ? (
                        <span className="badge-teal">Completed</span>
                      ) : inv.isOverdue ? (
                        <span className="badge-rose">Overdue — {formatCurrency(inv.balanceDue)} left</span>
                      ) : (
                        <span className="badge-amber">In progress — {formatCurrency(inv.balanceDue)} left</span>
                      )}
                    </td>
                    <td className="text-ink-muted dark:text-dark-muted">{inv.settledAt ? formatDate(inv.settledAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreditActionModal
        isOpen={actionModal.isOpen}
        onClose={handleClose}
        onSaved={refreshLists}
        invoice={activeInvoice}
        actionType={actionType}
      />
    </div>
  )
}

function CreditActionModal({ isOpen, onClose, onSaved, invoice, actionType }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('CASH')
  const [referenceNo, setReferenceNo] = useState('')
  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  // Once a payment/late-fee is saved, the form is replaced in-place by a
  // printable receipt for exactly what just happened — a sub-receipt for
  // a payment (tied back to the original invoice via receiptNumber), or
  // the late-fee's own small invoice (it's a real, separate Invoice row —
  // see Invoice.invoice_type in schema.prisma — so it gets a real receipt
  // too, not just a confirmation toast).
  const [receipt, setReceipt] = useState(null)
  const { companyName } = useBusinessSettings()

  useEffect(() => {
    if (isOpen) {
      setAmount('')
      setMethod('CASH')
      setReferenceNo('')
      setNote('')
      setDueDate('')
      setError('')
      setReceipt(null)
    }
  }, [isOpen])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) {
      setError('Enter a valid amount.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      if (actionType === 'payment') {
        const res = await creditService.recordPayment(invoice.id, { amount, method, referenceNo })
        setReceipt({ type: 'payment', payment: res.data.data.payment, invoice: res.data.data.invoice })
      } else {
        const res = await creditService.chargeLateFee(invoice.id, { amount, note, dueDate: dueDate || null })
        setReceipt({ type: 'late-fee', invoice: res.data.data })
      }
      // Refresh the tables behind the modal right away — the receipt view
      // the user is looking at doesn't need to change, but the Outstanding
      // list shouldn't look stale while they're printing.
      await onSaved()
    } catch (err) {
      // Handled by the global error popup (see errorBus.js) -- no local banner needed.
    } finally {
      setIsSaving(false)
    }
  }

  const formTitle = actionType === 'payment' ? `Record Payment — ${invoice?.customerName || ''}` : `Charge Late Fee — ${invoice?.customerName || ''}`
  const receiptTitle = actionType === 'payment' ? 'Payment Receipt' : 'Late Fee Receipt'

  if (receipt) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={receiptTitle} size="sm">
        <div className="receipt-panel card-premium shine-sweep glow-teal p-6">
          {receipt.type === 'payment' ? (
            <PaymentReceipt payment={receipt.payment} invoice={receipt.invoice} />
          ) : (
            <InvoiceReceipt invoice={receipt.invoice} />
          )}
        </div>
        <div className="flex gap-3 mt-4">
          <button
            type="button"
            className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5"
            onClick={() => printReceiptElement(receipt.type === 'payment' ? 'payment-receipt-print-area' : 'receipt-print-area')}
          >
            Print
          </button>
          <button
            type="button"
            className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5"
            onClick={() =>
              receipt.type === 'payment'
                ? downloadPaymentReceiptPdf(receipt.payment, receipt.invoice, companyName)
                : downloadReceiptPdf(receipt.invoice, companyName)
            }
          >
            Download PDF
          </button>
        </div>
        <button type="button" className="btn-accent w-full mt-3 transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
          Done
        </button>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={formTitle} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {invoice && (
          <p className="text-sm text-ink-muted dark:text-dark-muted bg-paper-dim dark:bg-dark-card2 rounded-lg px-3 py-2">
            {invoice.invoiceNumber} — currently owes <span className="font-semibold text-rose dark:text-dark-rose">{formatCurrency(invoice.balanceDue)}</span>
          </p>
        )}

        <div>
          <label className="label-text" htmlFor="credit-amount">
            {actionType === 'payment' ? 'Amount received' : 'Late fee amount'}
          </label>
          <input
            id="credit-amount"
            type="number"
            min="0"
            step="0.01"
            className="input-field figure"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>

        {actionType === 'payment' ? (
          <>
            <div>
              <label className="label-text" htmlFor="credit-method">
                Payment method
              </label>
              <select id="credit-method" className="input-field" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
              </select>
            </div>
            <div>
              <label className="label-text" htmlFor="credit-ref">
                Reference number <span className="text-ink-muted dark:text-dark-muted font-normal">(optional)</span>
              </label>
              <input id="credit-ref" className="input-field" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label-text" htmlFor="credit-note">
                Reason <span className="text-ink-muted dark:text-dark-muted font-normal">(optional)</span>
              </label>
              <input id="credit-note" className="input-field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 weeks overdue" />
            </div>
            <div>
              <label className="label-text" htmlFor="credit-due">
                New due date <span className="text-ink-muted dark:text-dark-muted font-normal">(optional)</span>
              </label>
              <input id="credit-due" type="date" className="input-field" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <p className="text-xs text-ink-muted dark:text-dark-muted bg-paper-dim dark:bg-dark-card2 rounded-lg px-3 py-2">
              This creates its own linked charge — the original invoice&apos;s recorded total never changes.
            </p>
          </>
        )}

        {error && <p className="text-xs text-rose dark:text-dark-rose">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="btn-accent disabled:opacity-60">
            {isSaving ? 'Saving…' : actionType === 'payment' ? 'Record Payment' : 'Charge Fee'}
          </button>
        </div>
      </form>
    </Modal>
  )
}