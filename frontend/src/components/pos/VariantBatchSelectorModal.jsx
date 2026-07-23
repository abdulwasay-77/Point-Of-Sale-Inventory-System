import { useState, useEffect } from 'react'
import Modal from '../common/Modal'
import Loading from '../common/Loading'
import EmptyState from '../common/EmptyState'
import { formatCurrency } from '../../utils/formatters'
import { productService } from '../../services/productService'

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
 */
export default function VariantBatchSelectorModal({ isOpen, onClose, product, initialQuantity = 1, onSelect }) {
  const needsVariant = Boolean(product?.isVariantTracked)
  const needsBatch = Boolean(product?.isBatchTracked)

  const [variants, setVariants] = useState([])
  const [batches, setBatches] = useState([])
  const [isLoadingVariants, setIsLoadingVariants] = useState(true)
  const [isLoadingBatches, setIsLoadingBatches] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [selectedVariantId, setSelectedVariantId] = useState(null)
  const [selectedBatchId, setSelectedBatchId] = useState(null)

  // Reset and load whichever first step this product needs.
  useEffect(() => {
    if (!isOpen || !product) return
    setSelectedVariantId(null)
    setSelectedBatchId(null)
    setQuantity(initialQuantity)
    setBatches([])

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
        .then((res) => setBatches(res.data.data))
        .finally(() => setIsLoadingBatches(false))
    }
  }, [isOpen, product, initialQuantity, needsVariant, needsBatch])

  // Once a variant is chosen (for a product that's both variant- and
  // batch-tracked), load only the batches belonging to that color.
  useEffect(() => {
    if (!isOpen || !product || !needsVariant || !needsBatch || !selectedVariantId) return
    setIsLoadingBatches(true)
    setSelectedBatchId(null)
    productService
      .getBatches(product.id, selectedVariantId)
      .then((res) => setBatches(res.data.data))
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
    onSelect({ variant: selectedVariant || null, batch: selectedBatch || null }, quantity)
  }

  const title = needsVariant && needsBatch
    ? `Select color & batch — ${product?.name || ''}`
    : needsVariant
      ? `Select color — ${product?.name || ''}`
      : `Select batch — ${product?.name || ''}`

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        {needsVariant && (
          <div>
            <p className="text-sm text-ink-muted mb-2">This product comes in multiple colors — pick one.</p>
            {isLoadingVariants ? (
              <Loading message="Loading colors…" />
            ) : variants.length === 0 ? (
              <EmptyState title="No colors in stock" description="No color options currently have stock." icon="🎨" />
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
                          : 'border-line hover:bg-paper-dim hover:-translate-y-0.5'
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
                          <p className="text-sm font-medium text-ink">{variant.name}</p>
                          {variant.priceAdjustment !== 0 && (
                            <p className="text-xs text-ink-muted figure">
                              {variant.priceAdjustment > 0 ? '+' : ''}
                              {formatCurrency(variant.priceAdjustment)}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-ink-muted figure">{variant.stock} in stock</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {showBatchStep && (
          <div>
            <p className="text-sm text-ink-muted mb-2">
              {needsVariant ? 'Pick the batch/shade within this color.' : 'This product is batch-tracked — pick the shade/lot.'}
            </p>
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
                          : 'border-line hover:bg-paper-dim hover:-translate-y-0.5'
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
                          <p className="text-sm font-medium text-ink figure">{batch.batchNumber}</p>
                          {batch.shadeCode && <p className="text-xs text-ink-muted">Shade {batch.shadeCode}</p>}
                        </div>
                      </div>
                      <span className="text-xs text-ink-muted figure">{batch.stock} in stock</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {isReady && (
          <div className="rounded-lg bg-paper-dim px-3 py-2.5">
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
              onChange={(e) => setQuantity(Math.max(1, Math.min(Number(e.target.value), maxStock)))}
            />
            {quantity < initialQuantity && (
              <p className="text-xs text-amber-dark mt-1">
                Adjusted down from {initialQuantity} — only {maxStock} in stock for this selection.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-line">
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
      </div>
    </Modal>
  )
}
