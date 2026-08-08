import { useState, useEffect } from 'react'
import Modal from '../common/Modal'
import Loading from '../common/Loading'
import EmptyState from '../common/EmptyState'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { productService } from '../../services/productService'
import { salesService } from '../../services/salesService'

/**
 * Handles product selection for anything that isn't a plain "just add it"
 * product — covers three cases, all through one flow so ProductSearchGrid
 * doesn't need to know which one it's dealing with:
 *
 *  - Batch-tracked only (e.g. tiles): pick which batch/shade to sell from.
 *  - Variant-tracked only (e.g. a product with color options): pick which
 *    color — this is a deliberate customer choice, not incidental lot
 *    variation, so it's a separate step from batches (see the
 *    ProductVariant model comment in schema.prisma for the distinction).
 *  - Both at once: pick a color first, then a batch *within* that color —
 *    e.g. "Red, Batch B2" — since a product can have manufacturing lot
 *    variation independently for each color.
 *
 * `initialQuantity` lets a caller pre-fill the quantity — used when the
 * Area-to-Box calculator has already computed a box count and needs to
 * hand off here to finish the line (see ProductSearchGrid).
 *
 * `customerId` — when a real customer is selected at checkout (not the
 * default walk-in customer), and this product is batch-tracked, this
 * looks up which batch that customer bought last time and pre-selects it
 * instead of leaving the picker blank. This matters for product
 * categories where matching the exact lot matters to the customer (e.g.
 * paint, tile, fabric dye lots) — see
 * sales.service.js#getCustomerLastBatch. If their usual batch is no
 * longer in stock, the next-oldest in-stock batch is auto-suggested
 * instead, with a note explaining the substitution — never silently.
 */
export default function VariantBatchSelectorModal({ isOpen, onClose, product, initialQuantity = 1, customerId, onSelect }) {
  const needsVariant = Boolean(product?.isVariantTracked)
  const needsBatch = Boolean(product?.isBatchTracked)
  // A product can use several Variations at once now (e.g. both Color and
  // Size) — was a single `variationName` string before; join every axis
  // name together for display here ("Color + Size").
  const variationLabel = (product?.variationNames || []).join(' + ') || 'variant'

  const [variants, setVariants] = useState([])
  const [batches, setBatches] = useState([])
  const [isLoadingVariants, setIsLoadingVariants] = useState(true)
  const [isLoadingBatches, setIsLoadingBatches] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [selectedVariantId, setSelectedVariantId] = useState(null)
  const [selectedBatchId, setSelectedBatchId] = useState(null)
  const [customerBatchNote, setCustomerBatchNote] = useState(null)

  // Best-effort only — never blocks the picker, never shown as an error
  // if it fails. `batches` is already ordered oldest-received-first (see
  // products.service.js#getBatches), so batches[0] is the correct
  // FIFO fallback when the customer's usual batch is unavailable.
  function applyCustomerBatchPreference(loadedBatches, variantIdUsed) {
    setCustomerBatchNote(null)
    if (!customerId || loadedBatches.length === 0) return Promise.resolve()
    return salesService
      .getCustomerLastBatch({ customerId, productId: product.id, variantId: variantIdUsed || undefined })
      .then((res) => {
        const info = res.data.data
        if (!info) return
        const usualBatch = loadedBatches.find((b) => b.id === info.batchId)
        if (info.stillInStock && usualBatch) {
          setSelectedBatchId(usualBatch.id)
          setQuantity((q) => Math.max(1, Math.min(q, usualBatch.stock)))
          setCustomerBatchNote(`This customer's usual batch — ${info.batchNumber} (last bought ${formatDate(info.purchasedAt)}).`)
        } else {
          const fallback = loadedBatches[0]
          if (!fallback) return
          setSelectedBatchId(fallback.id)
          setQuantity((q) => Math.max(1, Math.min(q, fallback.stock)))
          setCustomerBatchNote(`Their usual batch (${info.batchNumber}) is out of stock — selected ${fallback.batchNumber} instead.`)
        }
      })
      .catch(() => {})
  }

  // Reset and load whichever first step this product needs.
  useEffect(() => {
    if (!isOpen || !product) return
    setSelectedVariantId(null)
    setSelectedBatchId(null)
    setQuantity(initialQuantity)
    setBatches([])
    setCustomerBatchNote(null)

    if (needsVariant) {
      setIsLoadingVariants(true)
      productService
        .getVariants(product.id)
        .then((res) => setVariants(res.data.data))
        .finally(() => setIsLoadingVariants(false))
    } else if (needsBatch) {
      // Batch-tracked only — load all batches straight away, no variant
      // step in between.
      setIsLoadingBatches(true)
      productService
        .getBatches(product.id)
        .then((res) => {
          const loaded = res.data.data
          setBatches(loaded)
          return applyCustomerBatchPreference(loaded, null)
        })
        .finally(() => setIsLoadingBatches(false))
    }
  }, [isOpen, product, initialQuantity, needsVariant, needsBatch])

  // Once a variant is chosen (for a product that's both variant- and
  // batch-tracked), load only the batches belonging to that color.
  useEffect(() => {
    if (!isOpen || !product || !needsVariant || !needsBatch || !selectedVariantId) return
    setIsLoadingBatches(true)
    setSelectedBatchId(null)
    setCustomerBatchNote(null)
    productService
      .getBatches(product.id, selectedVariantId)
      .then((res) => {
        const loaded = res.data.data
        setBatches(loaded)
        return applyCustomerBatchPreference(loaded, selectedVariantId)
      })
      .finally(() => setIsLoadingBatches(false))
  }, [isOpen, product, needsVariant, needsBatch, selectedVariantId])

  const selectedVariant = variants.find((v) => v.id === selectedVariantId)
  const selectedBatch = batches.find((b) => b.id === selectedBatchId)

  // What actually caps the quantity right now, and what's ready to confirm
  // — depends on which combination of steps this product needs.
  const maxStock = needsBatch ? selectedBatch?.stock : needsVariant ? selectedVariant?.stock : product?.stock
  const isReady = (!needsVariant || selectedVariant) && (!needsBatch || selectedBatch)
  const showBatchStep = needsBatch && (!needsVariant || selectedVariantId)

  function handleConfirm() {
    if (!isReady) return
    // Same floor/ceiling as the blur handler above — belt-and-suspenders
    // in case "Add to Cart" is clicked while the field is transiently
    // empty (e.g. a fast click right after Backspace, before blur fires).
    const finalQuantity = Math.max(1, Math.min(Number(quantity) || 1, maxStock))
    onSelect({ variant: selectedVariant || null, batch: selectedBatch || null }, finalQuantity)
  }

  const title = needsVariant && needsBatch
    ? `Select ${variationLabel} & batch — ${product?.name || ''}`
    : needsVariant
      ? `Select ${variationLabel} — ${product?.name || ''}`
      : `Select batch — ${product?.name || ''}`

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      {/* max-height + its own scroll live directly on this div — same
          approach as AreaToBoxModal — so it bounds independently of the
          footer below. The footer is a plain sibling underneath, so
          Cancel/Add to Cart always render in full and stay reachable
          without scrolling, no matter how many variants/batches load in
          above. */}
      <div className="space-y-4 max-h-[52vh] overflow-y-auto thin-scrollbar pr-2 -mr-2">
        {needsVariant && (
          <div>
            <p className="text-sm text-ink-muted dark:text-dark-muted mb-2">
              This product comes in multiple {(variationLabel).toLowerCase()} options — pick one.
            </p>
            {isLoadingVariants ? (
              <Loading message={`Loading ${(variationLabel).toLowerCase()} options…`} />
            ) : variants.length === 0 ? (
              <EmptyState
                title={`No ${(variationLabel).toLowerCase()} options in stock`}
                description="None of this product's options currently have stock."
                icon="🏷️"
              />
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-hide">
                {variants.map((variant) => {
                  const isSelected = selectedVariantId === variant.id
                  return (
                    <label
                      key={variant.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-200 ${
                        isSelected
                          ? 'border-amber bg-amber/10 shadow-[0_0_0_1px_rgba(232,163,61,0.35),0_6px_16px_-4px_rgba(232,163,61,0.3)]'
                          : 'border-line dark:border-dark-border hover:bg-paper-dim dark:hover:bg-dark-card2 hover:-translate-y-0.5'
                      } ${variant.stock === 0 ? 'opacity-40 pointer-events-none' : ''}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="variant"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedVariantId(variant.id)
                            setQuantity((q) => Math.max(1, Math.min(q, variant.stock)))
                          }}
                          className="text-amber focus:ring-amber"
                        />
                        <div>
                          <p className="text-sm font-medium text-ink dark:text-dark-text">{variant.name}</p>
                          {variant.priceAdjustment !== 0 && (
                            <p className="text-xs text-ink-muted dark:text-dark-muted figure">
                              {variant.priceAdjustment > 0 ? '+' : ''}
                              {formatCurrency(variant.priceAdjustment)}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-ink-muted dark:text-dark-muted figure">{variant.stock} in stock</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {showBatchStep && (
          <div>
            <p className="text-sm text-ink-muted dark:text-dark-muted mb-2">
              {needsVariant
                ? `Pick the batch/shade within this ${(variationLabel).toLowerCase()}.`
                : 'This product is batch-tracked — pick the shade/lot.'}
            </p>
            {customerBatchNote && (
              <p className="text-xs text-teal-dark dark:text-dark-teal bg-teal-light dark:bg-dark-teal/15 rounded-lg px-2.5 py-1.5 mb-2">
                {customerBatchNote}
              </p>
            )}
            {isLoadingBatches ? (
              <Loading message="Loading batches…" />
            ) : batches.length === 0 ? (
              <EmptyState title="No batches in stock" description="No batches currently have stock." icon="📦" />
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-hide">
                {batches.map((batch) => {
                  const isSelected = selectedBatchId === batch.id
                  return (
                    <label
                      key={batch.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all duration-200 ${
                        isSelected
                          ? 'border-amber bg-amber/10 shadow-[0_0_0_1px_rgba(232,163,61,0.35),0_6px_16px_-4px_rgba(232,163,61,0.3)]'
                          : 'border-line dark:border-dark-border hover:bg-paper-dim dark:hover:bg-dark-card2 hover:-translate-y-0.5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="batch"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedBatchId(batch.id)
                            setQuantity((q) => Math.max(1, Math.min(q, batch.stock)))
                          }}
                          className="text-amber focus:ring-amber"
                        />
                        <div>
                          <p className="text-sm font-medium text-ink dark:text-dark-text figure">{batch.batchNumber}</p>
                        </div>
                      </div>
                      <span className="text-xs text-ink-muted dark:text-dark-muted figure">{batch.stock} in stock</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {isReady && (
          <div className="rounded-lg bg-paper-dim dark:bg-dark-card2 px-3 py-2.5">
            <label className="label-text" htmlFor="variant-batch-qty">
              Quantity
            </label>
            <input
              id="variant-batch-qty"
              type="number"
              min="1"
              max={maxStock}
              className="input-field figure"
              value={quantity}
              onChange={(e) => {
                const raw = e.target.value
                if (raw === '') {
                  // Let the field actually go empty while retyping —
                  // clamping straight back to 1 on every keystroke (the
                  // old behavior) meant Backspace never visibly cleared
                  // anything, so a fresh "2" landed as "12" instead of
                  // replacing the "1". The floor/ceiling is enforced on
                  // blur and again at submit time (handleConfirm)
                  // instead, so an empty/out-of-range value can't
                  // actually be added to the cart.
                  setQuantity('')
                  return
                }
                const num = Number(raw)
                if (Number.isNaN(num)) return
                setQuantity(Math.min(num, maxStock))
              }}
              onBlur={() => {
                setQuantity((q) => {
                  const num = Number(q)
                  if (q === '' || Number.isNaN(num) || num < 1) return 1
                  return Math.min(num, maxStock)
                })
              }}
            />
            {quantity !== '' && quantity < initialQuantity && (
              <p className="text-xs text-amber-dark dark:text-amber mt-1">
                Adjusted down from {initialQuantity} — only {maxStock} in stock for this selection.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-3 mt-3 border-t border-line dark:border-dark-border">
        <button type="button" className="btn-outline transition-all duration-200 hover:-translate-y-0.5" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!isReady}
          className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)] disabled:hover:translate-y-0 disabled:hover:shadow-none"
          onClick={handleConfirm}
        >
          Add to Cart
        </button>
      </div>
    </Modal>
  )
}