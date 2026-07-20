
import { useState, useEffect } from 'react'
import Modal from '../common/Modal'
import Loading from '../common/Loading'
import EmptyState from '../common/EmptyState'
import { productService } from '../../services/productService'

/**
 * FR: Batch & Lot Tracking. This product is batch-tracked (e.g. a tile
 * whose shade can vary lot to lot), so staff must pick which specific
 * batch to sell from — this is what guarantees an order comes out of one
 * consistent shade instead of an anonymous stock pool.
 *
 * `initialQuantity` lets a caller pre-fill the quantity — used when the
 * Area-to-Box calculator has already computed a box count for a
 * batch-tracked product and needs to hand off to this modal to finish
 * the line (see ProductSearchGrid).
 *
 * Premium pass: each batch option is now a tactile card that lifts
 * slightly on hover and glows amber when selected, instead of a flat
 * border/background swap.
 */
export default function BatchSelectorModal({ isOpen, onClose, product, initialQuantity = 1, onSelect }) {
  const [batches, setBatches] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [selectedBatchId, setSelectedBatchId] = useState(null)

  useEffect(() => {
    if (isOpen && product) {
      setIsLoading(true)
      setSelectedBatchId(null)
      setQuantity(initialQuantity)
      productService
        .getBatches(product.id)
        .then((res) => setBatches(res.data.data))
        .finally(() => setIsLoading(false))
    }
  }, [isOpen, product, initialQuantity])

  const selectedBatch = batches.find((b) => b.id === selectedBatchId)

  function handleConfirm() {
    if (!selectedBatch) return
    onSelect(selectedBatch, quantity)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Select batch — ${product?.name || ''}`} size="sm">
      {isLoading ? (
        <Loading message="Loading batches…" />
      ) : batches.length === 0 ? (
        <EmptyState title="No batches in stock" description="This product has no available batches right now." icon="📦" />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            This product is batch-tracked — pick the shade/lot to keep the order consistent.
          </p>
          <div className="space-y-2 max-h-56 overflow-y-auto">
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
                        // Clamp instead of resetting — the quantity may have
                        // come in pre-filled from the area calculator, and
                        // shouldn't silently jump back to 1 just because the
                        // staff switched which batch/shade they're selling.
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

          {selectedBatch && (
            <div className="rounded-lg bg-paper-dim px-3 py-2.5">
              <label className="label-text" htmlFor="batch-qty">
                Quantity
              </label>
              <input
                id="batch-qty"
                type="number"
                min="1"
                max={selectedBatch.stock}
                className="input-field figure"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(Number(e.target.value), selectedBatch.stock)))}
              />
              {quantity < initialQuantity && (
                <p className="text-xs text-amber-dark mt-1">
                  Adjusted down from {initialQuantity} — this batch only has {selectedBatch.stock} in stock.
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
              disabled={!selectedBatch}
              className="btn-accent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)] disabled:hover:translate-y-0 disabled:hover:shadow-none"
              onClick={handleConfirm}
            >
              Add to Cart
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
