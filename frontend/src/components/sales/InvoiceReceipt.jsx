

import { formatCurrency, formatDateTime } from '../../utils/formatters'

const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Online Transfer',
  UPI: 'UPI',
  CREDIT: 'Credit',
}

/**
 * Renders an invoice as a printed-receipt-style ticket. Reused by the
 * post-checkout confirmation modal (POS page) and the invoice detail page
 * (Sales History) so both look identical.
 *
 * `id="receipt-print-area"` is what the print stylesheet (index.css)
 * scopes `window.print()` to, so only this ticket prints instead of the
 * whole app shell.
 */
export default function InvoiceReceipt({ invoice }) {
  return (
    <div id="receipt-print-area" className="font-mono text-sm text-ink">
      <div className="text-center mb-4">
        <p className="font-display text-base font-semibold tracking-tight">Ledger POS</p>
        <p className="text-xs text-ink-muted">Store Receipt</p>
      </div>

      <div className="border-t border-dashed border-line pt-3 space-y-1 text-xs text-ink-muted">
        <div className="flex justify-between">
          <span>Invoice #</span>
          <span className="text-ink">{invoice.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Date</span>
          <span className="text-ink">{formatDateTime(invoice.date)}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer</span>
          <span className="text-ink">{invoice.customer}</span>
        </div>
        <div className="flex justify-between">
          <span>Cashier</span>
          <span className="text-ink">{invoice.cashier}</span>
        </div>
      </div>

      <div className="border-t border-dashed border-line mt-3 pt-3">
        {invoice.items.map((item) => (
          <div key={item.productId || item.kitId} className="flex justify-between py-1">
            <span className="truncate pr-2">
              {item.product} <span className="text-ink-muted">× {item.quantity}</span>
            </span>
            <span>{formatCurrency(item.price * item.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-line mt-3 pt-3 flex justify-between text-base font-semibold">
        <span>Total</span>
        <span>{formatCurrency(invoice.total)}</span>
      </div>

      {typeof invoice.amountPaid === 'number' && (
        <div className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-ink-muted">Payment Method</span>
            <span className="text-ink">{PAYMENT_METHOD_LABELS[invoice.paymentMethod] || invoice.paymentMethod}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Paid</span>
            <span className="text-ink">{formatCurrency(invoice.amountPaid)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Change</span>
            <span className="text-ink">{formatCurrency(invoice.changeDue || 0)}</span>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-ink-muted mt-4">Thank you for shopping with us.</p>
    </div>
  )
}
