
import { useEffect, useState } from 'react'
import PageHeader from '../../components/common/PageHeader'
import StockBadge from '../../components/products/StockBadge'
import EmptyState from '../../components/common/EmptyState'
import Loading from '../../components/common/Loading'
import Icon from '../../components/common/Icon'
import StatCard from '../../components/dashboard/StatCard'
import { reportService } from '../../services/reportService'
import { formatCurrency, formatDateTime } from '../../utils/formatters'

const TABS = [
  { id: 'today', label: "Today's Sales", icon: 'pos' },
  { id: 'monthly', label: 'Monthly Sales', icon: 'chart' },
  { id: 'lowstock', label: 'Low Stock Products', icon: 'inventory' },
]

/**
 * Reports — intentionally limited to the three reports this project
 * scope calls for. No charts/analytics; plain tables keep it realistic
 * for a one-month student project.
 *
 * Premium pass: the tab bar becomes a set of tactile icon pills (same
 * language as Inventory's "Low stock only" toggle), each report's summary
 * strip is now a receipt-panel / StatCard highlight instead of a plain
 * row, and every table picks up the shared `.card-premium .shine-sweep
 * .glow-*` + `.table-premium` treatment used across the rest of the app.
 */
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('today')

  return (
    <div>
      <PageHeader title="Reports" subtitle="Today's sales, this month's sales, and low stock." />

      <div className="flex flex-wrap gap-2 mb-5 sm:mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-inset transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-amber text-ink ring-amber shadow-[0_6px_16px_-6px_rgba(232,163,61,0.5)]'
                : 'bg-white text-ink-muted ring-line hover:text-ink hover:-translate-y-0.5 hover:shadow-[0_6px_16px_-8px_rgba(31,36,48,0.2)]'
            }`}
          >
            <Icon name={tab.icon} className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'today' && <TodaySalesReport />}
      {activeTab === 'monthly' && <MonthlySalesReport />}
      {activeTab === 'lowstock' && <LowStockReport />}
    </div>
  )
}

function TodaySalesReport() {
  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    reportService
      .getTodaySales()
      .then((res) => setReport(res.data.data))
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) return <Loading message="Loading today's sales…" />

  const invoices = report?.invoices || []

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5">
        <StatCard label="Total for Today" value={formatCurrency(report?.total)} icon="pos" tone="amber" highlight />
        <StatCard label="Invoices Today" value={report?.count || 0} icon="sales" tone="ink" />
      </div>

      <div className="card card-premium glow-amber">
        {invoices.length === 0 ? (
          <EmptyState title="No sales yet today" description="Invoices from today will show up here." icon="🗓️" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Time</th>
                  <th>Customer</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="group">
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="section-icon rounded-lg bg-amber-light text-amber-dark">
                          <Icon name="sales" className="h-4 w-4" />
                        </span>
                        <span className="figure text-amber-dark font-medium">{inv.invoiceNumber}</span>
                      </div>
                    </td>
                    <td className="text-ink-muted">{formatDateTime(inv.date)}</td>
                    <td className="font-medium">{inv.customer}</td>
                    <td className="figure text-right font-medium">{formatCurrency(inv.total)}</td>
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

function MonthlySalesReport() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    reportService
      .getMonthlySales(month, year)
      .then((res) => setReport(res.data.data))
      .finally(() => setIsLoading(false))
  }, [month, year])

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  })

  return (
    <div className="card card-premium glow-teal">
      <div className="p-4 border-b border-line flex flex-wrap items-center gap-3">
        <select
          className="input-field max-w-[160px]"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'long' })}
            </option>
          ))}
        </select>
        <select className="input-field max-w-[120px]" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <Loading message="Loading monthly sales…" />
      ) : (
        <div className="p-4 sm:p-5">
          <div className="receipt-panel card-premium shine-sweep glow-teal flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">{monthLabel}</p>
              <p className="text-sm text-ink-muted mt-1">
                <span className="figure text-ink font-medium">{report?.count || 0}</span> invoices
              </p>
            </div>
            <span className="figure text-xl sm:text-2xl font-semibold text-ink">
              {formatCurrency(report?.total)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function LowStockReport() {
  const [lowStock, setLowStock] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    reportService
      .getLowStock()
      .then((res) => setLowStock(res.data.data))
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) return <Loading message="Loading low stock report…" />

  return (
    <div>
      <div className="mb-5">
        <StatCard
          label="Products Running Low"
          value={lowStock.length}
          icon="inventory"
          tone="rose"
          highlight={lowStock.length > 0}
        />
      </div>

      <div className="card card-premium glow-rose">
        {lowStock.length === 0 ? (
          <EmptyState title="Stock levels look healthy" description="No products are currently low." icon="✅" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((product) => (
                  <tr key={product.id} className="group bg-rose-light/30">
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="section-icon rounded-lg bg-rose-light border border-rose/20 text-rose">
                          <Icon name="products" className="h-4 w-4" />
                        </span>
                        <span className="font-medium">{product.name}</span>
                      </div>
                    </td>
                    <td className="figure text-ink-muted">{product.sku}</td>
                    <td>{product.category}</td>
                    <td>
                      <StockBadge stock={product.stock} />
                    </td>
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
