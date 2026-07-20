

import { useEffect, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import PageHeader from '../../components/common/PageHeader'
import InvoiceReceipt from '../../components/sales/InvoiceReceipt'
import Badge from '../../components/common/Badge'
import Icon from '../../components/common/Icon'
import Loading from '../../components/common/Loading'
import { salesService } from '../../services/salesService'
import { downloadReceiptPdf } from '../../utils/receiptPdf'

/**
 * Invoice Detail — the full receipt for a single sale, reached from
 * Sales History. Shares the InvoiceReceipt component with the POS
 * checkout confirmation so both look identical.
 *
 * Premium pass: the receipt now sits inside the shared `.card-premium
 * .shine-sweep .glow-amber` surface (same signature treatment as the
 * POS cart / purchase totals), with a "Paid" status badge up top and
 * matching hover-lift on the two actions.
 */
export default function InvoiceDetailPage() {
  const { invoiceId } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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

  return (
    <div>
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        subtitle="Full details for this sale."
        action={
          <Link
            to="/sales"
            className="btn-outline transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(31,36,48,0.35)]"
          >
            <Icon name="chevronDown" className="h-4 w-4 rotate-90" />
            Back to Sales History
          </Link>
        }
      />

      <div className="max-w-sm">
        <div className="receipt-panel card-premium shine-sweep glow-amber p-6">
          <div className="flex justify-center mb-1">
            <Badge tone="teal">Paid</Badge>
          </div>
          <InvoiceReceipt invoice={invoice} />
        </div>
        <div className="flex gap-3 mt-4">
          <button
            type="button"
            className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(31,36,48,0.35)]"
            onClick={() => window.print()}
          >
            <Icon name="reports" className="h-4 w-4" />
            Print Invoice
          </button>
          <button
            type="button"
            className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(31,36,48,0.35)]"
            onClick={() => downloadReceiptPdf(invoice)}
          >
            Download PDF
          </button>
        </div>
      </div>
    </div>
  )
}
