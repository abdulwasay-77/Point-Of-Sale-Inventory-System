
import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../../components/common/PageHeader'
import SearchInput from '../../components/common/SearchInput'
import EmptyState from '../../components/common/EmptyState'
import Loading from '../../components/common/Loading'
import Pagination from '../../components/common/Pagination'
import StockBadge from '../../components/products/StockBadge'
import StatCard from '../../components/dashboard/StatCard'
import Icon from '../../components/common/Icon'
import { inventoryService } from '../../services/inventoryService'
import { LOW_STOCK_THRESHOLD } from '../../utils/constants'

const PAGE_SIZE = 8

/**
 * Inventory — read-only view of stock levels across the catalog.
 * Stock itself is only changed via Purchases (in) and POS checkout (out).
 *
 * Premium pass: a Dashboard-style stat row (reusing the exact `StatCard`
 * component) summarizes catalog health at a glance — all derived
 * client-side from the items already loaded — the "low stock only" filter
 * is now a tactile toggle chip, and out-of-stock/low-stock rows carry a
 * persistent tinted wash (not just on hover) so they're visible at a
 * glance while scanning the table, echoing the dashboard's low-stock list.
 */
export default function InventoryPage() {
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [onlyLowStock, setOnlyLowStock] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    inventoryService
      .getAll()
      .then((res) => setItems(res.data.data))
      .catch(() => setError('Could not load inventory.'))
      .finally(() => setIsLoading(false))
  }, [])

  const stats = useMemo(() => {
    const outOfStock = items.filter((p) => p.stock <= 0).length
    const lowStock = items.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD).length
    const inStock = items.length - outOfStock - lowStock
    return { total: items.length, inStock, lowStock, outOfStock }
  }, [items])

  const filtered = useMemo(() => {
    return items
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      .filter((p) => !onlyLowStock || p.stock <= LOW_STOCK_THRESHOLD)
      .sort((a, b) => a.stock - b.stock)
  }, [items, query, onlyLowStock])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Current stock levels across your catalog." />

      {error && <p className="text-sm text-rose bg-rose-light rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Products" value={stats.total} icon="products" tone="ink" />
          <StatCard label="In Stock" value={stats.inStock} icon="inventory" tone="teal" />
          <StatCard label="Low Stock" value={stats.lowStock} icon="inventory" tone="amber" highlight={stats.lowStock > 0} />
          <StatCard label="Out of Stock" value={stats.outOfStock} icon="inventory" tone="rose" />
        </div>
      )}

      <div className="card card-premium glow-rose">
        <div className="p-4 border-b border-line flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v)
              setPage(1)
            }}
            placeholder="Search products…"
            className="max-w-xs"
          />
          <button
            type="button"
            onClick={() => {
              setOnlyLowStock((prev) => !prev)
              setPage(1)
            }}
            aria-pressed={onlyLowStock}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition-all duration-200 ${
              onlyLowStock
                ? 'bg-rose-light text-rose ring-rose/30 shadow-[0_0_0_1px_rgba(193,80,46,0.2),0_4px_12px_-2px_rgba(193,80,46,0.25)]'
                : 'bg-white text-ink-muted ring-line hover:text-ink hover:ring-ink/20'
            }`}
          >
            {onlyLowStock && <span className="h-1.5 w-1.5 rounded-full bg-rose pulse-dot" aria-hidden="true" />}
            <Icon name="inventory" className="h-3.5 w-3.5" />
            Low stock only
          </button>
        </div>

        {isLoading ? (
          <Loading message="Loading inventory…" />
        ) : paginated.length === 0 ? (
          <EmptyState
            title="No matching products"
            description="Try clearing the search or the low-stock filter."
            icon="📉"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Current Stock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((product) => {
                  const isOut = product.stock <= 0
                  const isLow = !isOut && product.stock <= LOW_STOCK_THRESHOLD
                  return (
                    <tr
                      key={product.id}
                      className={`group ${isOut ? 'bg-rose-light/40' : isLow ? 'bg-amber-light/30' : ''}`}
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <span
                            className={`section-icon rounded-lg border ${
                              isOut
                                ? 'bg-rose-light border-rose/20 text-rose'
                                : isLow
                                ? 'bg-amber-light border-amber/20 text-amber-dark'
                                : 'bg-paper-dim border-line text-ink-muted'
                            }`}
                          >
                            <Icon name="products" className="h-4 w-4" />
                          </span>
                          <span className="font-medium">{product.name}</span>
                        </div>
                      </td>
                      <td className="figure text-ink-muted">{product.sku}</td>
                      <td className="figure font-medium">{product.stock}</td>
                      <td>
                        <StockBadge stock={product.stock} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  )
}
