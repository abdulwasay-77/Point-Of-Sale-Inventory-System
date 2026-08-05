import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/common/PageHeader'
import StatCard from '../../components/dashboard/StatCard'
import LowStockList from '../../components/dashboard/LowStockList'
import SalesChartCard from '../../components/dashboard/SalesChartCard'
import RecentSalesCard from '../../components/dashboard/RecentSalesCard'
import Loading from '../../components/common/Loading'
import Icon from '../../components/common/Icon'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import { formatCurrency } from '../../utils/formatters'
import { dashboardService } from '../../services/dashboardService'
import { inventoryService } from '../../services/inventoryService'

/**
 * Dashboard — the landing page after login. Surfaces the four numbers
 * that matter most day-to-day: catalog size, customer base, today's
 * sales, and anything running low — plus, below that, a live payment
 * breakdown for today, a real-data sales trend chart, and a feed of
 * recent transactions.
 *
 * Premium pass: soft ambient color blobs behind the page (`.dashboard-ambient`,
 * pure decoration, non-interactive), and every panel shares the same
 * lift + shine + glow treatment as the stat cards so the whole page
 * feels like one consistent, "alive" surface rather than static boxes.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const { has } = usePermissions()
  // The dashboard route only requires DASHBOARD_VIEW, but the low-stock
  // widget hits /inventory/low-stock, which is separately gated by
  // INVENTORY_VIEW on the backend. A user with DASHBOARD_VIEW but not
  // INVENTORY_VIEW would get a 403 on that call — which used to reject
  // the whole Promise.all below, so setSummary() never ran and the page
  // spun on "Loading dashboard…" forever. Fixed by skipping that request
  // entirely (and hiding the widget) for anyone who lacks the permission.
  const canViewInventory = has('INVENTORY_VIEW')
  const [summary, setSummary] = useState(null)
  const [lowStockProducts, setLowStockProducts] = useState([])
  const [recentSales, setRecentSales] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      dashboardService.getSummary(),
      canViewInventory ? inventoryService.getLowStock() : Promise.resolve({ data: { data: [] } }),
      dashboardService.getRecentSales(8),
    ])
      .then(([summaryRes, lowStockRes, recentSalesRes]) => {
        setSummary(summaryRes.data.data)
        setLowStockProducts(lowStockRes.data.data)
        setRecentSales(recentSalesRes.data.data)
      })
      .finally(() => setIsLoading(false))
  }, [canViewInventory])

  if (isLoading || !summary) return <Loading fullScreen message="Loading dashboard…" />

  return (
    <div className="dashboard-ambient">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'there'}`}
        subtitle="Here's how the store is doing today."
      />

      {/* Row 1 — core catalog / customer / sales snapshot (unchanged) */}
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

      {/* Row 2 — new payment breakdown tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4 sm:mt-5">
        <StatCard label="Today's Cash Payment" value={formatCurrency(summary.cashToday)} icon="payroll" tone="teal" />
        <StatCard label="Today's Card Payment" value={formatCurrency(summary.cardToday)} icon="creditCard" tone="amber" />
        <StatCard
          label="Credit / Due Today"
          value={summary.dueTodayCount === 0 ? 'No dues today' : formatCurrency(summary.dueTodayAmount)}
          icon="calendar"
          tone="rose"
        />
        <StatCard label="Sales on Installments" value={summary.activeInstallmentCount} icon="chart" tone="ink" />
      </div>

      {/* Row 3 — new sales chart, full width */}
      <div className="mt-5 sm:mt-6">
        <SalesChartCard />
      </div>

      {/* Row 4 — new recent sales feed, full width, same size as the chart above */}
      <div className="mt-5 sm:mt-6">
        <RecentSalesCard sales={recentSales} />
      </div>

      {/* Row 5 — low stock list + quick actions (unchanged) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 mt-5 sm:mt-6">
        {canViewInventory && (
          <div className="card card-premium shine-sweep glow-rose p-4 sm:p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg bg-rose-light dark:bg-dark-rose/15 text-rose dark:text-dark-rose flex items-center justify-center">
                  <Icon name="inventory" className="h-4 w-4" />
                </span>
                <h2 className="font-display text-base font-semibold text-ink dark:text-dark-text">Low stock products</h2>
              </div>
              <Link
                to="/inventory"
                className="text-sm text-amber-dark dark:text-amber font-medium hover:underline underline-offset-2"
              >
                View inventory →
              </Link>
            </div>
            <LowStockList products={lowStockProducts} />
          </div>
        )}

        <div className={`card card-premium shine-sweep glow-amber p-4 sm:p-5 ${canViewInventory ? '' : 'lg:col-span-3'}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-7 w-7 rounded-lg bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber flex items-center justify-center">
              <Icon name="chart" className="h-4 w-4" />
            </span>
            <h2 className="font-display text-base font-semibold text-ink dark:text-dark-text">Quick actions</h2>
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
              className="btn-outline justify-start transition-all duration-200 hover:-translate-y-0.5 hover:border-ink dark:hover:border-dark-border hover:shadow-[0_8px_20px_-8px_rgba(31,36,48,0.35)] dark:hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)]"
            >
              <Icon name="products" className="h-4 w-4" />
              Add a product
            </Link>
            <Link
              to="/purchases"
              className="btn-outline justify-start transition-all duration-200 hover:-translate-y-0.5 hover:border-teal dark:hover:border-dark-teal hover:text-teal-dark dark:hover:text-dark-teal hover:shadow-[0_8px_20px_-8px_rgba(47,111,107,0.35)]"
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