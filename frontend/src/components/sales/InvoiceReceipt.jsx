import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'

const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  BANK_TRANSFER: 'Online Transfer',
  CREDIT: 'Credit',
}

const SALE_TYPE_LABELS = {
  FULL: 'Paid in Full',
  CREDIT: 'Customer Credit',
  INSTALLMENT: 'Installment Plan',
}

/**
 * Renders an invoice as a printed-receipt-style ticket. Reused by the
 * post-checkout confirmation modal (POS page) and the invoice detail page
 * (Sales History) so both look identical.
 *
 * This is the ORIGINAL/PARENT receipt — the one generated once, at
 * checkout. It always reflects the full picture of the sale as agreed
 * that day: total, what was paid right then, and — for CREDIT/INSTALLMENT
 * sales — what's still owed and on what terms. It does NOT change as later
 * payments come in; each later payment gets its own sub-receipt instead
 * (see PaymentReceipt.jsx), so this original never has to be reprinted or
 * edited after the fact.
 *
 * `id="receipt-print-area"` is what printReceipt.js scopes window.print()
 * to at the moment of printing, so only this ticket prints instead of the
 * whole app shell. PaymentReceipt.jsx uses a different id
 * ("payment-receipt-print-area") on purpose — see printReceipt.js for why
 * two receipt-shaped components ever sharing one id was itself a bug.
 */
export default function InvoiceReceipt({ invoice }) {
  const { companyName } = useBusinessSettings()
  const saleType = invoice.saleType || (invoice.balanceDue > 0 ? 'CREDIT' : 'FULL')

  return (
    <div id="receipt-print-area" className="font-mono text-sm text-ink dark:text-dark-text">
      <div className="text-center mb-4">
        <p className="font-display text-base font-semibold tracking-tight">{companyName}</p>
        <p className="text-xs text-ink-muted dark:text-dark-muted">Store Receipt</p>
        {saleType !== 'FULL' && (
          <p className="text-[11px] font-semibold tracking-wide uppercase mt-1 text-amber dark:text-dark-amber">
            {SALE_TYPE_LABELS[saleType]}
          </p>
        )}
      </div>

      <div className="border-t border-dashed border-line dark:border-dark-border pt-3 space-y-1 text-xs text-ink-muted dark:text-dark-muted">
        <div className="flex justify-between">
          <span>Invoice #</span>
          <span className="text-ink dark:text-dark-text">{invoice.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Date</span>
          <span className="text-ink dark:text-dark-text">{formatDateTime(invoice.date)}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer</span>
          <span className="text-ink dark:text-dark-text">{invoice.customer}</span>
        </div>
        <div className="flex justify-between">
          <span>Cashier</span>
          <span className="text-ink dark:text-dark-text">{invoice.cashier}</span>
        </div>
      </div>

      <div className="border-t border-dashed border-line dark:border-dark-border mt-3 pt-3">
        {invoice.items.map((item) => (
          <div key={item.productId || item.kitId} className="flex justify-between py-1">
            <span className="truncate pr-2">
              {item.product} <span className="text-ink-muted dark:text-dark-muted">× {item.quantity}</span>
            </span>
            <span>{formatCurrency(item.price * item.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-line dark:border-dark-border mt-3 pt-3 flex justify-between text-base font-semibold">
        <span>Total</span>
        <span>{formatCurrency(invoice.total)}</span>
      </div>

      {typeof invoice.amountPaid === 'number' && (
        <div className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-ink-muted dark:text-dark-muted">Payment Method</span>
            <span className="text-ink dark:text-dark-text">{PAYMENT_METHOD_LABELS[invoice.paymentMethod] || invoice.paymentMethod}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted dark:text-dark-muted">{saleType === 'FULL' ? 'Paid' : 'Paid Today'}</span>
            <span className="text-ink dark:text-dark-text">{formatCurrency(invoice.amountPaid)}</span>
          </div>
          {saleType === 'FULL' && (
            <div className="flex justify-between">
              <span className="text-ink-muted dark:text-dark-muted">Change</span>
              <span className="text-ink dark:text-dark-text">{formatCurrency(invoice.changeDue || 0)}</span>
            </div>
          )}
        </div>
      )}

      {/* CREDIT: this is NOT a full payment — the remaining balance and
          when it's due must be unmissable on the printed ticket, not
          just visible in the app. */}
      {saleType === 'CREDIT' && (
        <div className="border-t border-dashed border-line dark:border-dark-border mt-3 pt-3 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose dark:text-dark-rose">
            This is a partial payment — not paid in full
          </p>
          <div className="flex justify-between text-sm font-semibold">
            <span>Balance Remaining</span>
            <span className="text-rose dark:text-dark-rose">{formatCurrency(invoice.balanceDue)}</span>
          </div>
          {invoice.dueDate && (
            <div className="flex justify-between text-xs">
              <span className="text-ink-muted dark:text-dark-muted">Due On</span>
              <span className="text-ink dark:text-dark-text">{formatDate(invoice.dueDate)}</span>
            </div>
          )}
          <p className="text-[11px] text-ink-muted dark:text-dark-muted pt-1">
            Partial payments accepted before the due date. Each payment gets its own receipt.
          </p>
        </div>
      )}

      {/* INSTALLMENT: the schedule terms agreed at checkout, frozen here
          for the record — see InstallmentPlan in the schema. */}
      {saleType === 'INSTALLMENT' && invoice.installmentPlan && (
        <div className="border-t border-dashed border-line dark:border-dark-border mt-3 pt-3 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber dark:text-dark-amber">
            Installment Plan Details
          </p>
          <div className="flex justify-between text-xs">
            <span className="text-ink-muted dark:text-dark-muted">Down Payment</span>
            <span className="text-ink dark:text-dark-text">{formatCurrency(invoice.installmentPlan.downPayment)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-ink-muted dark:text-dark-muted">Remaining Balance</span>
            <span className="text-ink dark:text-dark-text">{formatCurrency(invoice.balanceDue)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-ink-muted dark:text-dark-muted">Number of Installments</span>
            <span className="text-ink dark:text-dark-text">{invoice.installmentPlan.installmentCount}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-ink-muted dark:text-dark-muted">Amount per Installment</span>
            <span className="text-ink dark:text-dark-text">{formatCurrency(invoice.installmentPlan.installmentAmount)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-ink-muted dark:text-dark-muted">Frequency</span>
            <span className="text-ink dark:text-dark-text">Every {invoice.installmentPlan.frequencyDays} days</span>
          </div>
          <p className="text-[11px] text-ink-muted dark:text-dark-muted pt-1">
            See the Installments page for the full payment schedule.
          </p>
        </div>
      )}

      <p className="text-center text-xs text-ink-muted dark:text-dark-muted mt-4">Thank you for shopping with us.</p>
    </div>
  )
}