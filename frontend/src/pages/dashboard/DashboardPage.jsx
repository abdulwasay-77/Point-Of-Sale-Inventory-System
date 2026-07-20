
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/common/PageHeader'
import StatCard from '../../components/dashboard/StatCard'
import LowStockList from '../../components/dashboard/LowStockList'
import Loading from '../../components/common/Loading'
import Icon from '../../components/common/Icon'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../utils/formatters'
import { dashboardService } from '../../services/dashboardService'
import { inventoryService } from '../../services/inventoryService'

/**
 * Dashboard — the landing page after login. Surfaces the four numbers
 * that matter most day-to-day: catalog size, customer base, today's
 * sales, and anything running low.
 *
 * Premium pass: soft ambient color blobs behind the page (`.dashboard-ambient`,
 * pure decoration, non-interactive), and the two lower panels now share the
 * same lift + shine + glow treatment as the stat cards so the whole page
 * feels like one consistent, "alive" surface rather than static boxes.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const [summary, setSummary] = useState(null)
  const [lowStockProducts, setLowStockProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.all([dashboardService.getSummary(), inventoryService.getLowStock()])
      .then(([summaryRes, lowStockRes]) => {
        setSummary(summaryRes.data.data)
        setLowStockProducts(lowStockRes.data.data)
      })
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading || !summary) return <Loading fullScreen message="Loading dashboard…" />

  return (
    <div className="dashboard-ambient">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle="Here's how the store is doing today."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Products" value={summary.totalProducts} icon="products" tone="ink" />
        <StatCard label="Total Customers" value={summary.totalCustomers} icon="customers" tone="teal" />
        <StatCard
          label="Today's Sales"
          value={formatCurrency(summary.todaysSales)}
          icon="pos"
          tone="amber"
          highlight
        />
        <StatCard label="Low Stock Products" value={summary.lowStockCount} icon="inventory" tone="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 mt-5 sm:mt-6">
        <div className="card card-premium shine-sweep glow-rose p-4 sm:p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-rose-light text-rose flex items-center justify-center">
                <Icon name="inventory" className="h-4 w-4" />
              </span>
              <h2 className="font-display text-base font-semibold text-ink">Low stock products</h2>
            </div>
            <Link
              to="/inventory"
              className="text-sm text-amber-dark font-medium hover:underline underline-offset-2"
            >
              View inventory →
            </Link>
          </div>
          <LowStockList products={lowStockProducts} />
        </div>

        <div className="card card-premium shine-sweep glow-amber p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-7 w-7 rounded-lg bg-amber-light text-amber-dark flex items-center justify-center">
              <Icon name="chart" className="h-4 w-4" />
            </span>
            <h2 className="font-display text-base font-semibold text-ink">Quick actions</h2>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              to="/pos"
              className="btn-accent justify-start relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-6px_rgba(232,163,61,0.55)]"
            >
              <Icon name="pos" className="h-4 w-4" />
              Start a new sale
            </Link>
            <Link
              to="/products"
              className="btn-outline justify-start transition-all duration-200 hover:-translate-y-0.5 hover:border-ink hover:shadow-[0_8px_20px_-8px_rgba(31,36,48,0.35)]"
            >
              <Icon name="products" className="h-4 w-4" />
              Add a product
            </Link>
            <Link
              to="/purchases"
              className="btn-outline justify-start transition-all duration-200 hover:-translate-y-0.5 hover:border-teal hover:text-teal-dark hover:shadow-[0_8px_20px_-8px_rgba(47,111,107,0.35)]"
            >
              <Icon name="purchases" className="h-4 w-4" />
              Record a purchase
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
