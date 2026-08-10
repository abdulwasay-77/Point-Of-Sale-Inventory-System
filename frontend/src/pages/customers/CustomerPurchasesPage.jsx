import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import PageHeader from '../../components/common/PageHeader'
import EmptyState from '../../components/common/EmptyState'
import Loading from '../../components/common/Loading'
import Badge from '../../components/common/Badge'
import Icon from '../../components/common/Icon'
import StatCard from '../../components/dashboard/StatCard'
import { customerService } from '../../services/customerService'
import { formatCurrency, formatDateTime } from '../../utils/formatters'

const TYPE_TONES = {
  RETAIL: 'amber',
  WHOLESALE: 'teal',
  CONTRACTOR: 'rose',
}

/**
 * Condenses an invoice's line items into a short, readable summary for
 * the table cell — e.g. "Ceramic Tile 60x60 ×10, PVC Pipe 1in ×4 +2 more".
 * Late-fee invoices (see InvoiceType in schema.prisma) carry no items at
 * all, so those get their own label instead of an empty cell.
 */
function itemsSummary(invoice) {
  if (invoice.invoiceType === 'LATE_FEE') return 'Late fee charge'
  const items = invoice.items || []
  if (items.length === 0) return '—'
  const labels = items.map((item) => `${item.product}${Number(item.quantity) > 1 ? ` ×${item.quantity}` : ''}`)
  if (labels.length <= 2) return labels.join(', ')
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`
}

/** Same status-badge logic as InvoiceDetailPage, so the two pages read identically. */
function statusBadge(invoice) {
  if (invoice.status === 'VOID') {
    return <Badge tone="rose">Void</Badge>
  }
  if (invoice.saleType === 'FULL') {
    return <Badge tone="teal">Paid in Full</Badge>
  }
  if (invoice.balanceDue === 0) {
    return (
      <Badge tone="teal">{invoice.saleType === 'INSTALLMENT' ? 'Installments Complete' : 'Credit Paid Off'}</Badge>
    )
  }
  return (
    <Badge tone="amber">
      {invoice.saleType === 'INSTALLMENT' ? 'Installment' : 'Credit'} — {formatCurrency(invoice.balanceDue)} due
    </Badge>
  )
}

/**
 * Customer Purchases — read-only purchase history for a single customer,
 * reached from the "View Details" action on the Customers page.
 *
 * Backed by GET /api/customers/:id/purchases, which reuses the exact same
 * toInvoiceDTO shaping as Sales History / Invoice Detail — so `saleType`
 * (FULL / CREDIT / INSTALLMENT), `balanceDue`, and `items` all come from
 * the one source of truth rather than a second parallel DTO.
 *
 * Each row is a summary; clicking it opens the existing Invoice Detail
 * page (full receipt + payment history) instead of duplicating that view
 * here.
 */
export default function CustomerPurchasesPage() {
  const { customerId } = useParams()
  const [customer, setCustomer] = useState(null)
  const [purchases, setPurchases] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    Promise.all([customerService.getById(customerId), customerService.getPurchases(customerId)])
      .then(([customerRes, purchasesRes]) => {
        if (cancelled) return
        setCustomer(customerRes.data.data)
        setPurchases(purchasesRes.data.data)
      })
      .catch((err) => {
        if (cancelled) return
        if (err.response?.status === 404) {
          setNotFound(true)
        } else {
          setError('Could not load this customer\u2019s purchase history.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [customerId])

  const stats = useMemo(() => {
    const completed = purchases.filter((p) => p.status !== 'VOID')
    const totalSpent = completed.reduce((sum, p) => sum + (Number(p.total) || 0), 0)
    const outstandingBalance = completed.reduce((sum, p) => sum + (Number(p.balanceDue) || 0), 0)
    const activeInstallments = completed.filter(
      (p) => p.saleType === 'INSTALLMENT' && p.installmentPlan?.status === 'ACTIVE',
    ).length
    return {
      count: completed.length,
      totalSpent,
      outstandingBalance,
      activeInstallments,
    }
  }, [purchases])

  if (notFound) {
    return <Navigate to="/customers" replace />
  }

  if (isLoading) {
    return <Loading fullScreen message="Loading purchase history…" />
  }

  return (
    <div data-keyboard-scope>
      <PageHeader
        title={customer ? `${customer.name}'s Purchases` : 'Purchase History'}
        subtitle="Every sale on record for this customer."
        action={
          <Link
            to="/customers"
            className="btn-outline transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(31,36,48,0.35)] dark:hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)]"
          >
            <Icon name="chevronDown" className="h-4 w-4 rotate-90" />
            Back to Customers
          </Link>
        }
      />

      {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {customer && (
        <div className="card card-premium glow-ink p-4 sm:p-5 mb-5 sm:mb-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-ink-muted dark:text-dark-muted">Type</span>
            <Badge tone={TYPE_TONES[customer.customerType] || 'amber'}>{customer.customerType || 'RETAIL'}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-muted dark:text-dark-muted">Phone</span>
            <span className="figure">{customer.phone}</span>
          </div>
          {customer.creditLimit !== null && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-xs uppercase tracking-wide text-ink-muted dark:text-dark-muted">Credit Limit</span>
              <span className="figure">{formatCurrency(customer.creditLimit)}</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
        <StatCard label="Total Purchases" value={stats.count} icon="sales" tone="ink" />
        <StatCard label="Total Spent" value={formatCurrency(stats.totalSpent)} icon="chart" tone="teal" />
        <StatCard
          label="Outstanding Balance"
          value={formatCurrency(stats.outstandingBalance)}
          icon="creditCard"
          tone="amber"
          highlight={stats.outstandingBalance > 0}
        />
        <StatCard label="Active Installment Plans" value={stats.activeInstallments} icon="calendar" tone="rose" />
      </div>

      <div className="card card-premium glow-teal">
        {purchases.length === 0 ? (
          <EmptyState
            title="No purchases yet"
            description="Once this customer buys something, it'll show up here."
            icon="🧾"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Items Purchased</th>
                  <th className="text-right">Amount</th>
                  <th>Payment / Status</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((invoice) => (
                  <tr key={invoice.id} className="group">
                    <td>
                      <Link to={`/sales/${invoice.id}`} className="flex items-center gap-3">
                        <span className="section-icon rounded-lg bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
                          <Icon name="sales" className="h-4 w-4" />
                        </span>
                        <span className="figure text-amber-dark dark:text-amber font-medium group-hover:underline underline-offset-2">
                          {invoice.invoiceNumber}
                        </span>
                      </Link>
                    </td>
                    <td className="text-ink-muted dark:text-dark-muted whitespace-nowrap">
                      {formatDateTime(invoice.date)}
                    </td>
                    <td className="max-w-xs truncate" title={itemsSummary(invoice)}>
                      {itemsSummary(invoice)}
                    </td>
                    <td className="figure text-right font-medium whitespace-nowrap">{formatCurrency(invoice.total)}</td>
                    <td>{statusBadge(invoice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
