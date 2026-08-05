import { formatCurrency, formatDateTime } from '../../utils/formatters'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'

const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  BANK_TRANSFER: 'Online Transfer',
  CREDIT: 'Credit',
}

/**
 * A SUB-RECEIPT — printed/downloaded for one later payment against an
 * invoice that was originally opened on Customer Credit or an Installment
 * Plan. It is NOT a new invoice and never restates the original sale's
 * item list or total; it exists purely to acknowledge "this specific
 * amount was received, on this date, against that original invoice," and
 * to show the balance before/after so both sides have a paper trail for
 * every partial payment, not just the first and last.
 *
 * `payment` is one entry from invoice.payments (see utils/invoiceDto.js
 * on the backend) — already carries its own receiptNumber (e.g.
 * INV-00007-R2), amount, method, date, and the frozen balanceAfter
 * snapshot. `invoice` is the parent invoice, used only for header context
 * (invoice #, customer, total) — never re-rendered as if it were new.
 */
export default function PaymentReceipt({ payment, invoice }) {
  const { companyName } = useBusinessSettings()
  const balanceBefore = payment.balanceAfter !== null ? payment.balanceAfter + payment.amount : null
  // payment.amount is always net of change (see backend/src/utils/invoiceDto.js),
  // so what the customer actually handed over is amount + changeDue.
  const changeDue = payment.changeDue || 0
  const amountTendered = payment.amount + changeDue

  return (
    <div id="payment-receipt-print-area" className="font-mono text-sm text-ink dark:text-dark-text">
      <div className="text-center mb-4">
        <p className="font-display text-base font-semibold tracking-tight">{companyName}</p>
        <p className="text-xs text-ink-muted dark:text-dark-muted">Payment Receipt</p>
        <p className="text-[11px] font-semibold tracking-wide uppercase mt-1 text-teal dark:text-dark-teal">
          {payment.isInstallment ? `Installment #${payment.installmentSequence}` : 'Credit Payment'}
        </p>
      </div>

      <div className="border-t border-dashed border-line dark:border-dark-border pt-3 space-y-1 text-xs text-ink-muted dark:text-dark-muted">
        <div className="flex justify-between">
          <span>Receipt #</span>
          <span className="text-ink dark:text-dark-text">{payment.receiptNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Against Invoice</span>
          <span className="text-ink dark:text-dark-text">{invoice.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Date</span>
          <span className="text-ink dark:text-dark-text">{formatDateTime(payment.paymentDate)}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer</span>
          <span className="text-ink dark:text-dark-text">{invoice.customer}</span>
        </div>
        {payment.referenceNo && (
          <div className="flex justify-between">
            <span>Reference #</span>
            <span className="text-ink dark:text-dark-text">{payment.referenceNo}</span>
          </div>
        )}
      </div>

      {changeDue > 0 ? (
        <div className="border-t border-dashed border-line dark:border-dark-border mt-3 pt-3 space-y-1">
          <div className="flex justify-between text-base font-semibold">
            <span>Amount Tendered</span>
            <span className="text-teal dark:text-dark-teal">{formatCurrency(amountTendered)}</span>
          </div>
          <div className="flex justify-between text-xs text-ink-muted dark:text-dark-muted">
            <span>Applied to Balance</span>
            <span className="text-ink dark:text-dark-text">{formatCurrency(payment.amount)}</span>
          </div>
          <div className="flex justify-between text-xs text-ink-muted dark:text-dark-muted">
            <span>Change Given</span>
            <span className="text-ink dark:text-dark-text">{formatCurrency(changeDue)}</span>
          </div>
        </div>
      ) : (
        <div className="border-t border-dashed border-line dark:border-dark-border mt-3 pt-3 flex justify-between text-base font-semibold">
          <span>Amount Received</span>
          <span className="text-teal dark:text-dark-teal">{formatCurrency(payment.amount)}</span>
        </div>
      )}

      <div className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-ink-muted dark:text-dark-muted">Payment Method</span>
          <span className="text-ink dark:text-dark-text">{PAYMENT_METHOD_LABELS[payment.method] || payment.method}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-muted dark:text-dark-muted">Invoice Total</span>
          <span className="text-ink dark:text-dark-text">{formatCurrency(invoice.total)}</span>
        </div>
        {balanceBefore !== null && (
          <div className="flex justify-between">
            <span className="text-ink-muted dark:text-dark-muted">Balance Before</span>
            <span className="text-ink dark:text-dark-text">{formatCurrency(balanceBefore)}</span>
          </div>
        )}
      </div>

      <div className="border-t border-dashed border-line dark:border-dark-border mt-3 pt-3 flex justify-between text-sm font-semibold">
        <span>{payment.balanceAfter > 0 ? 'Balance Remaining' : 'Balance'}</span>
        <span className={payment.balanceAfter > 0 ? 'text-rose dark:text-dark-rose' : 'text-teal dark:text-dark-teal'}>
          {payment.balanceAfter > 0 ? formatCurrency(payment.balanceAfter) : 'Paid in Full'}
        </span>
      </div>

      <p className="text-center text-[11px] text-ink-muted dark:text-dark-muted mt-4">
        See invoice {invoice.invoiceNumber} for the full item list.
      </p>
    </div>
  )
}