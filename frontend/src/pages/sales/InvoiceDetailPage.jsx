import { useEffect, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import PageHeader from '../../components/common/PageHeader'
import InvoiceReceipt from '../../components/sales/InvoiceReceipt'
import PaymentReceipt from '../../components/sales/PaymentReceipt'
import Badge from '../../components/common/Badge'
import Icon from '../../components/common/Icon'
import Loading from '../../components/common/Loading'
import Modal from '../../components/common/Modal'
import { useDisclosure } from '../../hooks/useDisclosure'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { salesService } from '../../services/salesService'
import { downloadReceiptPdf, downloadPaymentReceiptPdf } from '../../utils/receiptPdf'
import { printReceiptElement } from '../../utils/printReceipt'
import { formatCurrency, formatDateTime } from '../../utils/formatters'

const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  BANK_TRANSFER: 'Online Transfer',
  CREDIT: 'Credit',
}

/**
 * Invoice Detail — the full receipt for a single sale, reached from
 * Sales History. Shares the InvoiceReceipt component with the POS
 * checkout confirmation so both look identical.
 *
 * Below the original receipt, a Payment History list shows every Payment
 * ever recorded against this invoice (the checkout payment, plus any
 * later credit top-ups or installment payments). The first is covered by
 * the receipt above; every payment after that is a sub-receipt in its own
 * right — printable/downloadable individually — since a CREDIT or
 * INSTALLMENT sale can have several payments over time and each one
 * deserves its own paper trail back to this invoice.
 *
 * Premium pass: the receipt now sits inside the shared `.card-premium
 * .shine-sweep .glow-amber` surface (same signature treatment as the
 * POS cart / purchase totals), with a status badge up top and matching
 * hover-lift on the two actions.
 */
export default function InvoiceDetailPage() {
  const { invoiceId } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activePayment, setActivePayment] = useState(null)
  const { companyName } = useBusinessSettings()

  const paymentModal = useDisclosure()

  useEffect(() => {
    salesService
      .getById(invoiceId)
      .then((res) => setInvoice(res.data.data))
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false))
  }, [invoiceId])

  if (notFound) {
    return <Navigate to="/sales" replace />
  }

  if (isLoading || !invoice) {
    return <Loading fullScreen message="Loading invoice…" />
  }

  const statusBadge =
    invoice.saleType === 'FULL' ? (
      <Badge tone="teal">Paid</Badge>
    ) : invoice.balanceDue === 0 ? (
      <Badge tone="teal">Settled — {invoice.saleType === 'INSTALLMENT' ? 'Installments Complete' : 'Credit Paid Off'}</Badge>
    ) : (
      <Badge tone="amber">
        {invoice.saleType === 'INSTALLMENT' ? 'Installment Plan' : 'Customer Credit'} — {formatCurrency(invoice.balanceDue)} due
      </Badge>
    )

  const subPayments = (invoice.payments || []).filter((p) => p.isSubReceipt)

  function openPayment(payment) {
    setActivePayment(payment)
    paymentModal.open()
  }

  return (
    <div>
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        subtitle="Full details for this sale."
        action={
          <Link
            to="/sales"
            className="btn-outline transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(31,36,48,0.35)] dark:hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)]"
          >
            <Icon name="chevronDown" className="h-4 w-4 rotate-90" />
            Back to Sales History
          </Link>
        }
      />

      <div className="max-w-sm">
        <div className="receipt-panel card-premium shine-sweep glow-amber p-6">
          <div className="flex justify-center mb-1">{statusBadge}</div>
          <InvoiceReceipt invoice={invoice} />
        </div>
        <div className="flex gap-3 mt-4">
          <button
            type="button"
            className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(31,36,48,0.35)] dark:hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)]"
            onClick={() => printReceiptElement('receipt-print-area')}
          >
            <Icon name="reports" className="h-4 w-4" />
            Print Invoice
          </button>
          <button
            type="button"
            className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(31,36,48,0.35)] dark:hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)]"
            onClick={() => downloadReceiptPdf(invoice, companyName)}
          >
            Download PDF
          </button>
        </div>

        {subPayments.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-ink dark:text-dark-text mb-3">
              Payment History
              <span className="ml-2 text-xs font-normal text-ink-muted dark:text-dark-muted">
                {subPayments.length} payment{subPayments.length === 1 ? '' : 's'} after checkout
              </span>
            </h2>
            <ul className="card card-premium divide-y divide-line/70 dark:divide-dark-border/70">
              {subPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 p-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {p.label} <span className="text-ink-muted dark:text-dark-muted font-normal">— {p.receiptNumber}</span>
                    </p>
                    <p className="text-xs text-ink-muted dark:text-dark-muted">
                      {formatDateTime(p.paymentDate)} · {PAYMENT_METHOD_LABELS[p.method] || p.method}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="figure text-sm font-semibold">{formatCurrency(p.amount)}</p>
                    <button type="button" className="text-xs text-amber dark:text-dark-amber hover:underline" onClick={() => openPayment(p)}>
                      View Receipt
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Modal isOpen={paymentModal.isOpen} onClose={paymentModal.close} title="Payment Receipt" size="sm">
        {activePayment && (
          <>
            <div className="receipt-panel card-premium shine-sweep glow-teal p-6">
              <PaymentReceipt payment={activePayment} invoice={invoice} />
            </div>
            <div className="flex gap-3 mt-4">
              <button type="button" className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5" onClick={() => printReceiptElement('payment-receipt-print-area')}>
                Print
              </button>
              <button
                type="button"
                className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5"
                onClick={() => downloadPaymentReceiptPdf(activePayment, invoice, companyName)}
              >
                Download PDF
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}