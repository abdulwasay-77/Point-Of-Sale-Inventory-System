
import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/common/PageHeader'
import SearchInput from '../../components/common/SearchInput'
import EmptyState from '../../components/common/EmptyState'
import Loading from '../../components/common/Loading'
import Icon from '../../components/common/Icon'
import StatCard from '../../components/dashboard/StatCard'
import { salesService } from '../../services/salesService'
import { formatCurrency, formatDateTime } from '../../utils/formatters'

/**
 * Sales History — search and browse past invoices. Clicking a row opens
 * the full invoice detail page.
 *
 * Premium pass: a Dashboard-style stat row (reusing the exact `StatCard`
 * component) surfaces invoice count, total revenue, today's revenue, and
 * average sale value — all derived client-side from the invoices already
 * loaded — plus the shared lift + shine + glow treatment on the list card
 * and a receipt-style icon avatar per row, echoing Purchases/Inventory.
 */
export default function SalesHistoryPage() {
  const [query, setQuery] = useState('')
  const [invoices, setInvoices] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    salesService
      .getAll()
      .then((res) => setInvoices(res.data.data))
      .catch(() => setError('Could not load sales history.'))
      .finally(() => setIsLoading(false))
  }, [])

  const stats = useMemo(() => {
    const totalRevenue = invoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0)
    const today = new Date()
    const todaysInvoices = invoices.filter((inv) => {
      const d = new Date(inv.date)
      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      )
    })
    const todaysRevenue = todaysInvoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0)
    const avgSale = invoices.length ? totalRevenue / invoices.length : 0

    return { count: invoices.length, totalRevenue, todaysRevenue, avgSale }
  }, [invoices])

  const filtered = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(query.toLowerCase()) ||
          inv.customer.toLowerCase().includes(query.toLowerCase()),
      ),
    [invoices, query],
  )

  return (
    <div>
      <PageHeader title="Sales History" subtitle="Browse and search past invoices." />

      {error && <p className="text-sm text-rose bg-rose-light rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Invoices" value={stats.count} icon="sales" tone="ink" />
          <StatCard label="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon="chart" tone="teal" />
          <StatCard
            label="Today's Revenue"
            value={formatCurrency(stats.todaysRevenue)}
            icon="pos"
            tone="amber"
            highlight
          />
          <StatCard label="Average Sale" value={formatCurrency(stats.avgSale)} icon="reports" tone="rose" />
        </div>
      )}

      <div className="card card-premium glow-teal">
        <div className="p-4 border-b border-line">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by invoice # or customer…"
            className="max-w-xs"
          />
        </div>

        {isLoading ? (
          <Loading message="Loading sales…" />
        ) : filtered.length === 0 ? (
          <EmptyState title="No invoices found" description="Try a different search." icon="🧾" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Cashier</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((invoice) => (
                  <tr key={invoice.id} className="group">
                    <td>
                      <Link to={`/sales/${invoice.id}`} className="flex items-center gap-3">
                        <span className="section-icon rounded-lg bg-amber-light text-amber-dark">
                          <Icon name="sales" className="h-4 w-4" />
                        </span>
                        <span className="figure text-amber-dark font-medium group-hover:underline underline-offset-2">
                          {invoice.invoiceNumber}
                        </span>
                      </Link>
                    </td>
                    <td className="text-ink-muted">{formatDateTime(invoice.date)}</td>
                    <td className="font-medium">{invoice.customer}</td>
                    <td className="text-ink-muted">{invoice.cashier}</td>
                    <td className="figure text-right font-medium">{formatCurrency(invoice.total)}</td>
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
