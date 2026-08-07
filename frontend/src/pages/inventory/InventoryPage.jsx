import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../../components/common/PageHeader'
import SearchInput from '../../components/common/SearchInput'
import EmptyState from '../../components/common/EmptyState'
import Loading from '../../components/common/Loading'
import Pagination from '../../components/common/Pagination'
import Modal from '../../components/common/Modal'
import StockBadge from '../../components/products/StockBadge'
import StatCard from '../../components/dashboard/StatCard'
import Icon from '../../components/common/Icon'
import { inventoryService } from '../../services/inventoryService'
import { warehouseService } from '../../services/warehouseService'
import { LOW_STOCK_THRESHOLD } from '../../utils/constants'

const PAGE_SIZE = 8

/**
 * Inventory — two tabs:
 *
 *  - All Products: read-only stock levels across the whole catalog,
 *    same as before. Stock itself is only changed via Purchases (in)
 *    and POS checkout (out), never edited directly here.
 *
 *  - By Location: real multi-location stock management, not just a
 *    per-row filter. Each warehouse is a card of its own — click one to
 *    open every product actually stocked there, with its quantity AT
 *    that specific location, in a dedicated panel. This is the
 *    location-first view a business running more than one store/branch
 *    actually needs: "what do I have at Main Warehouse right now",
 *    answered directly, not inferred by expanding one product row at a
 *    time.
 *
 * Both tabs read from the same inventoryService.getAll() call — each
 * product already carries its full per-warehouse breakdown (see
 * inventory.service.js) — so By Location is built by pivoting that same
 * data around warehouse instead of product, not a second API call.
 */
export default function InventoryPage() {
  const [tab, setTab] = useState('products')
  const [items, setItems] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([inventoryService.getAll(), warehouseService.getAll()])
      .then(([invRes, whRes]) => {
        setItems(invRes.data.data)
        setWarehouses(whRes.data.data)
      })
      .catch(() => setError('Could not load inventory.'))
      .finally(() => setIsLoading(false))
  }, [])

  const stats = useMemo(() => {
    const outOfStock = items.filter((p) => p.stock <= 0).length
    const lowStock = items.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD).length
    const inStock = items.length - outOfStock - lowStock
    return { total: items.length, inStock, lowStock, outOfStock }
  }, [items])

  const showLocationTab = warehouses.length > 1

  const TABS = [
    { id: 'products', label: 'All Products', icon: 'products' },
    ...(showLocationTab ? [{ id: 'location', label: 'By Location', icon: 'inventory' }] : []),
  ]

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Current stock levels across your catalog." />

      {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Products" value={stats.total} icon="products" tone="ink" />
          <StatCard label="In Stock" value={stats.inStock} icon="inventory" tone="teal" />
          <StatCard label="Low Stock" value={stats.lowStock} icon="inventory" tone="amber" highlight={stats.lowStock > 0} />
          <StatCard label="Out of Stock" value={stats.outOfStock} icon="inventory" tone="rose" />
        </div>
      )}

      {showLocationTab && (
        <div className="flex gap-1 border-b border-line dark:border-dark-border mb-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all duration-200 ${
                tab === t.id
                  ? 'border-amber text-ink dark:text-dark-text'
                  : 'border-transparent text-ink-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-text'
              }`}
            >
              <Icon name={t.icon} className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <Loading message="Loading inventory…" />
      ) : tab === 'location' ? (
        <ByLocationTab items={items} warehouses={warehouses} />
      ) : (
        <AllProductsTab items={items} />
      )}
    </div>
  )
}

function AllProductsTab({ items }) {
  const [query, setQuery] = useState('')
  const [onlyLowStock, setOnlyLowStock] = useState(false)
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    return items
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      .filter((p) => !onlyLowStock || p.stock <= LOW_STOCK_THRESHOLD)
      .sort((a, b) => a.stock - b.stock)
  }, [items, query, onlyLowStock])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="card card-premium glow-rose">
      <div className="p-4 border-b border-line dark:border-dark-border flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
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
              ? 'bg-rose-light dark:bg-dark-rose/15 text-rose dark:text-dark-rose ring-rose/30 dark:ring-dark-rose/30 shadow-[0_0_0_1px_rgba(193,80,46,0.2),0_4px_12px_-2px_rgba(193,80,46,0.25)]'
              : 'bg-white dark:bg-dark-card text-ink-muted dark:text-dark-muted ring-line dark:ring-dark-border hover:text-ink dark:hover:text-dark-text hover:ring-ink/20'
          }`}
        >
          {onlyLowStock && <span className="h-1.5 w-1.5 rounded-full bg-rose dark:bg-dark-rose pulse-dot" aria-hidden="true" />}
          <Icon name="inventory" className="h-3.5 w-3.5" />
          Low stock only
        </button>
      </div>

      {paginated.length === 0 ? (
        <EmptyState title="No matching products" description="Try clearing the search or the low-stock filter." icon="📉" />
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
                  <tr key={product.id} className={isOut ? 'bg-rose-light/40 dark:bg-dark-rose/15' : isLow ? 'bg-amber-light/30 dark:bg-amber/15' : ''}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span
                          className={`section-icon rounded-lg border ${
                            isOut
                              ? 'bg-rose-light dark:bg-dark-rose/15 border-rose/20 dark:border-dark-rose/20 text-rose dark:text-dark-rose'
                              : isLow
                              ? 'bg-amber-light dark:bg-amber/15 border-amber/20 text-amber-dark dark:text-amber'
                              : 'bg-paper-dim dark:bg-dark-card2 border-line dark:border-dark-border text-ink-muted dark:text-dark-muted'
                          }`}
                        >
                          <Icon name="products" className="h-4 w-4" />
                        </span>
                        <span className="font-medium">{product.name}</span>
                      </div>
                    </td>
                    <td className="figure text-ink-muted dark:text-dark-muted">{product.sku}</td>
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
  )
}

function ByLocationTab({ items, warehouses }) {
  const [activeWarehouse, setActiveWarehouse] = useState(null)

  // Pivots the same per-product data around warehouse instead — every
  // warehouse gets its own list of {product, sku, quantity}, plus a
  // running total and distinct-product count for the card summary
  // below. Built once per render from data already on the page; no
  // second request.
  const byWarehouse = useMemo(() => {
    const map = new Map(warehouses.map((w) => [w.id, { warehouse: w, products: [], totalUnits: 0 }]))
    for (const product of items) {
      for (const entry of product.byWarehouse || []) {
        const bucket = map.get(entry.warehouseId)
        if (!bucket) continue
        bucket.products.push({ id: product.id, name: product.name, sku: product.sku, quantity: entry.quantity })
        bucket.totalUnits += entry.quantity
      }
    }
    return map
  }, [items, warehouses])

  const active = activeWarehouse ? byWarehouse.get(activeWarehouse.id) : null

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {warehouses.map((w) => {
          const bucket = byWarehouse.get(w.id)
          const productCount = bucket?.products.length ?? 0
          const totalUnits = bucket?.totalUnits ?? 0
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => setActiveWarehouse(w)}
              className="card card-premium text-left p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(31,36,48,0.25)] dark:hover:shadow-[0_10px_24px_-8px_rgba(0,0,0,0.5)]"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="section-icon rounded-lg bg-paper-dim dark:bg-dark-card2 border border-line dark:border-dark-border text-ink-muted dark:text-dark-muted">
                  <Icon name="inventory" className="h-4 w-4" />
                </span>
                <span className="font-medium text-ink dark:text-dark-text">{w.name}</span>
              </div>
              <div className="flex items-baseline gap-4">
                <div>
                  <p className="text-2xl font-semibold text-ink dark:text-dark-text figure">{totalUnits}</p>
                  <p className="text-xs text-ink-muted dark:text-dark-muted">Total units</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-ink dark:text-dark-text figure">{productCount}</p>
                  <p className="text-xs text-ink-muted dark:text-dark-muted">Products stocked</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {active && (
        <LocationDetailModal
          warehouse={activeWarehouse}
          products={active.products}
          onClose={() => setActiveWarehouse(null)}
        />
      )}
    </>
  )
}

function LocationDetailModal({ warehouse, products, onClose }) {
  const [query, setQuery] = useState('')

  const filtered = products
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.quantity - a.quantity)

  return (
    <Modal isOpen onClose={onClose} title={`Stock at ${warehouse.name}`} size="md">
      <div className="p-4 border-b border-line dark:border-dark-border">
        <SearchInput value={query} onChange={setQuery} placeholder="Search products at this location…" />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title={query ? 'No matching products' : 'No stock at this location yet'}
          description={query ? 'Try a different search.' : 'Bring stock in via Purchases, or transfer it in from another location.'}
          icon="📦"
        />
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Quantity here</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td className="figure text-ink-muted dark:text-dark-muted">{p.sku}</td>
                  <td className="figure font-medium">{p.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}