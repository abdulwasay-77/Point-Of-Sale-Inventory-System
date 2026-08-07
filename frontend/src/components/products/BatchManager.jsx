import { useState, useEffect } from 'react'
import Icon from '../common/Icon'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { productService } from '../../services/productService'

const emptyDraft = { variantId: '', batchNumber: '', quantity: '', costPrice: '', warehouseId: '' }

/**
 * Opening-stock management for a batch-tracked product, right on the
 * product form — replaces the old flow where a batch-tracked product was
 * locked to 0 stock here and had to be topped up through a throwaway
 * Purchase order just to get its first units in. Each batch added here
 * creates a real Batch, StockLevel, CostLot, and STOCK_IN StockMovement,
 * exactly like a purchase would (see products.service.js#createOpeningBatch)
 * — this is a second front door onto the same real stock-in machinery,
 * not a separate lightweight mechanism.
 *
 * When the product also has Variations attached, batches are scoped per
 * variant — same as the POS batch selector already scopes batches to a
 * chosen variant (see VariantBatchSelectorModal) — so a variant must be
 * picked before a batch can be added.
 *
 * Only usable once the product actually exists (has an id) — a Batch row
 * always belongs to a real product_id, so a brand-new, not-yet-saved
 * product has nothing yet to attach a batch to (see the "save first"
 * message shown instead, in ProductFormModal).
 */
export default function BatchManager({ productId, isVariantTracked, warehouses }) {
  const [batches, setBatches] = useState([])
  const [variants, setVariants] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [draft, setDraft] = useState(emptyDraft)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setIsLoading(true)
    Promise.all([
      productService.getBatches(productId, null, { includeZeroStock: true }),
      isVariantTracked ? productService.getVariants(productId) : Promise.resolve({ data: { data: [] } }),
    ])
      .then(([batchesRes, variantsRes]) => {
        setBatches(batchesRes.data.data)
        setVariants(variantsRes.data.data)
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, isVariantTracked])

  function variantName(variantId) {
    if (!variantId) return null
    return variants.find((v) => v.id === variantId)?.name || null
  }

  async function handleAdd() {
    if (isVariantTracked && !draft.variantId) {
      setError('Pick which value this batch belongs to first.')
      return
    }
    if (!draft.batchNumber.trim()) {
      setError('Batch number is required.')
      return
    }
    if (!(Number(draft.quantity) > 0)) {
      setError('Starting quantity must be greater than 0.')
      return
    }
    if (draft.costPrice === '' || Number(draft.costPrice) < 0) {
      setError('Enter a valid cost price.')
      return
    }
    setError('')
    setIsSaving(true)
    try {
      await productService.createBatch(productId, {
        variantId: draft.variantId || undefined,
        batchNumber: draft.batchNumber.trim(),
        quantity: draft.quantity,
        costPrice: draft.costPrice,
        warehouseId: draft.warehouseId || undefined,
      })
      setDraft(emptyDraft)
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add this batch.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-line dark:border-dark-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="section-icon bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal">
          <Icon name="inventory" className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">Batches</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-muted dark:text-dark-muted">Loading…</p>
      ) : batches.length === 0 ? (
        <p className="text-sm text-ink-muted dark:text-dark-muted mb-3">No batches yet.</p>
      ) : (
        <ul className="divide-y divide-line/70 dark:divide-dark-border/70 mb-3">
          {batches.map((batch) => (
            <li key={batch.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink dark:text-dark-text figure truncate">
                  {batch.batchNumber}
                  {isVariantTracked && variantName(batch.variantId) && (
                    <span className="ml-1.5 text-xs font-normal text-ink-muted dark:text-dark-muted">
                      · {variantName(batch.variantId)}
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-muted dark:text-dark-muted figure">
                  {batch.stock} in stock · received {formatDate(batch.receivedDate)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="bg-paper-dim dark:bg-dark-card2 rounded-lg p-2.5 space-y-2">
        {isVariantTracked && (
          <select
            className="input-field !py-1.5 text-sm"
            value={draft.variantId}
            onChange={(e) => setDraft((d) => ({ ...d, variantId: e.target.value }))}
          >
            <option value="">Select a value…</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input-field figure !py-1.5 text-sm"
            placeholder="Batch number"
            value={draft.batchNumber}
            onChange={(e) => setDraft((d) => ({ ...d, batchNumber: e.target.value }))}
          />
          <input
            type="number"
            min="0"
            step="1"
            className="input-field figure !py-1.5 text-sm"
            placeholder="Starting quantity"
            value={draft.quantity}
            onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            className="input-field figure !py-1.5 text-sm"
            placeholder="Cost price"
            value={draft.costPrice}
            onChange={(e) => setDraft((d) => ({ ...d, costPrice: e.target.value }))}
          />
          {warehouses.length > 1 ? (
            <select
              className="input-field !py-1.5 text-sm"
              value={draft.warehouseId}
              onChange={(e) => setDraft((d) => ({ ...d, warehouseId: e.target.value }))}
            >
              <option value="">Main warehouse (default)</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center text-xs text-ink-muted dark:text-dark-muted px-1">
              {warehouses[0]?.name || 'Main warehouse'}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-rose dark:text-dark-rose">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAdd}
            disabled={isSaving}
            className="btn-accent !py-1.5 !px-3 text-xs transition-all duration-200 hover:-translate-y-0.5"
          >
            {isSaving ? 'Saving…' : 'Add Batch'}
          </button>
        </div>
      </div>
    </div>
  )
}
