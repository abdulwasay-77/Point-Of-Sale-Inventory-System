
import { useState, useMemo, useEffect } from 'react'
import PageHeader from '../../components/common/PageHeader'
import EmptyState from '../../components/common/EmptyState'
import Loading from '../../components/common/Loading'
import Icon from '../../components/common/Icon'
import Modal from '../../components/common/Modal'
import Pagination from '../../components/common/Pagination'
import StatCard from '../../components/dashboard/StatCard'
import { useDisclosure } from '../../hooks/useDisclosure'
import { purchaseService } from '../../services/purchaseService'
import { supplierService } from '../../services/supplierService'
import { productService } from '../../services/productService'
import { warehouseService } from '../../services/warehouseService'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { usePermissions } from '../../hooks/usePermissions'

const PAGE_SIZE = 6

/**
 * Purchases — record stock coming in from a supplier. Saving a purchase
 * atomically increases each product's stock on the backend, so Inventory
 * reflects it immediately after the list is reloaded. Batch-tracked
 * products (FR: Batch & Lot Tracking) require a batch number + optional
 * shade code per line; a warehouse can be picked (FR: multi-location).
 *
 * Premium pass: a Dashboard-style stat row up top (reusing the exact
 * `StatCard` component) surfaces the numbers that matter at a glance —
 * all derived client-side from the purchases already on the page, no
 * extra endpoints needed — plus the same lift + shine + glow treatment
 * on the list card/table and the New Purchase modal's line-item rows.
 */
export default function PurchasesPage() {
  const { has } = usePermissions()
  const canManagePricing = has('PRICING_MANAGE')
  const [purchases, setPurchases] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [suggestedPrices, setSuggestedPrices] = useState([])
  const [applyingId, setApplyingId] = useState(null)
  const formModal = useDisclosure()

  async function loadData() {
    setIsLoading(true)
    try {
      const [purchasesRes, suppliersRes, productsRes, warehousesRes] = await Promise.all([
        purchaseService.getAll(),
        supplierService.getAll(),
        productService.getAll(),
        warehouseService.getAll(),
      ])
      setPurchases(purchasesRes.data.data)
      setSuppliers(suppliersRes.data.data)
      setProducts(productsRes.data.data)
      setWarehouses(warehousesRes.data.data)
    } catch {
      setError('Could not load purchases.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const stats = useMemo(() => {
    const now = new Date()
    const totalSpend = purchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0)
    const thisMonthSpend = purchases
      .filter((p) => {
        const d = new Date(p.date)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      .reduce((sum, p) => sum + (Number(p.total) || 0), 0)
    const suppliersUsed = new Set(purchases.map((p) => p.supplier)).size

    return {
      count: purchases.length,
      totalSpend,
      thisMonthSpend,
      suppliersUsed,
    }
  }, [purchases])

  const totalPages = Math.max(1, Math.ceil(purchases.length / PAGE_SIZE))
  const paginated = purchases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function handleCreate(payload) {
    try {
      const res = await purchaseService.create(payload)
      formModal.close()
      setPage(1)
      // Suggested retail/wholesale prices, computed server-side from the
      // new cost + each product's target margin — never applied
      // automatically, shown here for the admin to accept or dismiss.
      setSuggestedPrices(canManagePricing ? res.data.data.suggestedPrices || [] : [])
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the purchase.')
    }
  }

  async function applySuggestedPrice(suggestion) {
    setApplyingId(suggestion.productId)
    try {
      const formData = new FormData()
      formData.append('price', suggestion.suggestedRetailPrice)
      formData.append('wholesale_price', suggestion.suggestedWholesalePrice)
      await productService.update(suggestion.productId, formData)
      setSuggestedPrices((prev) => prev.filter((s) => s.productId !== suggestion.productId))
      await loadData()
    } catch {
      setError('Could not apply the suggested price.')
    } finally {
      setApplyingId(null)
    }
  }

  function dismissSuggestion(productId) {
    setSuggestedPrices((prev) => prev.filter((s) => s.productId !== productId))
  }

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle="Record incoming stock from your suppliers."
        action={
          <button
            type="button"
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
            onClick={formModal.open}
            disabled={isLoading}
          >
            <Icon name="plus" className="h-4 w-4" />
            New Purchase
          </button>
        }
      />

      {error && <p className="text-sm text-rose bg-rose-light rounded-lg px-3 py-2 mb-4">{error}</p>}

      {suggestedPrices.length > 0 && (
        <div className="rounded-xl border border-amber/40 bg-amber-light/40 px-4 py-3 mb-5 sm:mb-6">
          <p className="text-sm font-semibold text-ink mb-2">
            Cost changed on {suggestedPrices.length} product{suggestedPrices.length === 1 ? '' : 's'} — suggested price based on target margin:
          </p>
          <ul className="space-y-2">
            {suggestedPrices.map((s) => (
              <li key={s.productId} className="flex flex-wrap items-center justify-between gap-2 text-sm bg-white/60 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{s.productName}</span>
                  <span className="text-ink-muted ml-2 figure">
                    {formatCurrency(s.currentRetailPrice)} → {formatCurrency(s.suggestedRetailPrice)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => applySuggestedPrice(s)}
                    disabled={applyingId === s.productId}
                    className="btn-accent !py-1 !px-3 text-xs transition-all duration-200 hover:-translate-y-0.5"
                  >
                    {applyingId === s.productId ? 'Applying…' : 'Apply'}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissSuggestion(s.productId)}
                    className="btn-outline !py-1 !px-3 text-xs transition-all duration-200 hover:-translate-y-0.5"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Purchases" value={stats.count} icon="purchases" tone="ink" />
          <StatCard label="Total Spend" value={formatCurrency(stats.totalSpend)} icon="chart" tone="teal" />
          <StatCard
            label="This Month's Spend"
            value={formatCurrency(stats.thisMonthSpend)}
            icon="pos"
            tone="amber"
            highlight
          />
          <StatCard label="Suppliers Used" value={stats.suppliersUsed} icon="suppliers" tone="rose" />
        </div>
      )}

      <div className="card card-premium glow-amber">
        {isLoading ? (
          <Loading message="Loading purchases…" />
        ) : purchases.length === 0 ? (
          <EmptyState
            title="No purchases recorded yet"
            description="Record your first purchase to bring stock into inventory."
            actionLabel="New Purchase"
            onAction={formModal.open}
            icon="🧾"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-premium">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Items</th>
                  <th className="text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((purchase) => (
                  <tr key={purchase.id} className="group">
                    <td className="text-ink-muted">{formatDate(purchase.date)}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="section-icon rounded-lg bg-amber-light text-amber-dark">
                          <Icon name="purchases" className="h-4 w-4" />
                        </span>
                        <span className="font-medium">{purchase.supplier}</span>
                      </div>
                    </td>
                    <td className="text-ink-muted">
                      {purchase.items.map((i) => `${i.product}${i.batchNumber ? ` (${i.batchNumber})` : ''}`).join(', ')}
                    </td>
                    <td className="figure text-right font-medium">{formatCurrency(purchase.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      <NewPurchaseModal
        isOpen={formModal.isOpen}
        onClose={formModal.close}
        onSave={handleCreate}
        suppliers={suppliers}
        products={products}
        warehouses={warehouses}
      />
    </div>
  )
}

/** Modal form: select supplier + warehouse, add product lines with qty,
 *  cost price, and (for batch-tracked products) a batch number/shade. */
function NewPurchaseModal({ isOpen, onClose, onSave, suppliers, products, warehouses }) {
  const [supplierId, setSupplierId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [lines, setLines] = useState([{ productId: '', quantity: 1, costPrice: '', batchNumber: '', shadeCode: '' }])

  useEffect(() => {
    if (isOpen) {
      setSupplierId(suppliers[0]?.id || '')
      setWarehouseId(warehouses[0]?.id || '')
      setLines([{ productId: products[0]?.id || '', quantity: 1, costPrice: '', batchNumber: '', shadeCode: '' }])
    }
  }, [isOpen, suppliers, products, warehouses])

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.costPrice) || 0), 0),
    [lines],
  )

  function updateLine(index, field, value) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)))
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: products[0]?.id || '', quantity: 1, costPrice: '', batchNumber: '', shadeCode: '' }])
  }

  function removeLine(index) {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  function productFor(id) {
    return products.find((p) => p.id === id)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const items = lines
      .filter((l) => l.productId && Number(l.quantity) > 0 && l.costPrice !== '')
      .map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        costPrice: Number(l.costPrice),
        batchNumber: l.batchNumber?.trim() || undefined,
        shadeCode: l.shadeCode?.trim() || undefined,
      }))

    if (!items.length || !supplierId) return
    // Batch-tracked products require a batch number — block submit and let
    // the per-line required input handle the messaging.
    for (const item of items) {
      const product = productFor(item.productId)
      if (product?.isBatchTracked && !item.batchNumber) return
    }

    onSave({ supplierId, warehouseId: warehouseId || undefined, items })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Purchase" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text" htmlFor="purchase-supplier">
              Supplier
            </label>
            <select id="purchase-supplier" className="input-field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text" htmlFor="purchase-warehouse">
              Receiving Location
            </label>
            <select id="purchase-warehouse" className="input-field" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label-text mb-0">Products</label>
            <button
              type="button"
              onClick={addLine}
              className="btn-ghost text-xs px-2 py-1 transition-all duration-200 hover:text-amber-dark hover:-translate-y-0.5"
            >
              <Icon name="plus" className="h-3.5 w-3.5" />
              Add line
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => {
              const product = productFor(line.productId)
              return (
                <div
                  key={index}
                  className="rounded-lg border border-line p-2.5 space-y-2 transition-all duration-200 hover:border-amber/50 hover:shadow-[0_4px_14px_-4px_rgba(232,163,61,0.25)]"
                >
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <select
                      className="input-field col-span-6"
                      value={line.productId}
                      onChange={(e) => updateLine(index, 'productId', e.target.value)}
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.isBatchTracked ? ' (batch tracked)' : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      className="input-field col-span-2 figure"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, 'quantity', e.target.value)}
                      placeholder="Qty"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input-field col-span-3 figure"
                      value={line.costPrice}
                      onChange={(e) => updateLine(index, 'costPrice', e.target.value)}
                      placeholder="Cost price"
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                      className="btn-ghost col-span-1 justify-center px-0 py-2 transition-all duration-200 hover:text-rose disabled:opacity-30"
                      aria-label="Remove line"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>

                  {product?.isBatchTracked && (
                    <div className="grid grid-cols-2 gap-2 pl-1">
                      <input
                        className="input-field figure text-sm"
                        value={line.batchNumber}
                        onChange={(e) => updateLine(index, 'batchNumber', e.target.value)}
                        placeholder="Batch number (required)"
                        required
                      />
                      <input
                        className="input-field figure text-sm"
                        value={line.shadeCode}
                        onChange={(e) => updateLine(index, 'shadeCode', e.target.value)}
                        placeholder="Shade code (optional)"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="receipt-panel card-premium glow-amber flex items-center justify-between px-4 py-3.5">
          <span className="text-sm text-ink-muted">Total cost</span>
          <span className="figure text-lg font-semibold text-ink">{formatCurrency(total)}</span>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
          >
            Save Purchase
          </button>
        </div>
      </form>
    </Modal>
  )
}
