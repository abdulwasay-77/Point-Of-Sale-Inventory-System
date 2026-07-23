import { useState, useEffect } from 'react'
import Icon from '../common/Icon'
import { formatCurrency } from '../../utils/formatters'
import { productService } from '../../services/productService'

const emptyDraft = { variantName: '', sku: '', priceAdjustment: '', stock: '' }

/**
 * Manages color/shade variants for one product — a deliberate customer
 * choice (e.g. "red" vs "blue"), not the same thing as a batch (see the
 * ProductVariant model comment in schema.prisma). Each variant is saved
 * immediately when added/edited (not batched up with the rest of the
 * product form) since it needs its own stock record created server-side —
 * same reasoning as why barcode generation saves immediately for an
 * existing product elsewhere in this form.
 */
export default function VariantManager({ productId }) {
  const [variants, setVariants] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setIsLoading(true)
    productService
      .getVariants(productId)
      .then((res) => setVariants(res.data.data))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  function startEdit(variant) {
    setEditingId(variant.id)
    setDraft({ variantName: variant.name, sku: variant.sku, priceAdjustment: variant.priceAdjustment, stock: '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(emptyDraft)
    setError('')
  }

  async function handleSave() {
    if (!draft.variantName.trim()) {
      setError('Color name is required.')
      return
    }
    if (!draft.sku.trim()) {
      setError('Each color needs its own SKU.')
      return
    }
    setError('')
    setIsSaving(true)
    try {
      if (editingId) {
        await productService.updateVariant(productId, editingId, {
          variantName: draft.variantName.trim(),
          sku: draft.sku.trim().toUpperCase(),
          priceAdjustment: draft.priceAdjustment === '' ? 0 : draft.priceAdjustment,
        })
      } else {
        await productService.createVariant(productId, {
          variantName: draft.variantName.trim(),
          sku: draft.sku.trim().toUpperCase(),
          priceAdjustment: draft.priceAdjustment === '' ? 0 : draft.priceAdjustment,
          stock: draft.stock === '' ? 0 : draft.stock,
        })
      }
      cancelEdit()
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save this color.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemove(variantId) {
    if (!window.confirm('Remove this color? Existing sales history is kept either way.')) return
    await productService.removeVariant(productId, variantId)
    load()
  }

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="section-icon bg-amber-light text-amber-dark">
          <Icon name="categories" className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Color Options</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : variants.length === 0 ? (
        <p className="text-sm text-ink-muted mb-3">No colors added yet.</p>
      ) : (
        <ul className="divide-y divide-line/70 mb-3">
          {variants.map((variant) => (
            <li key={variant.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{variant.name}</p>
                <p className="text-xs text-ink-muted figure">
                  {variant.sku} · {variant.stock} in stock
                  {variant.priceAdjustment !== 0 && (
                    <span className="ml-1">
                      · {variant.priceAdjustment > 0 ? '+' : ''}
                      {formatCurrency(variant.priceAdjustment)}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(variant)}
                  className="p-1.5 rounded-lg text-ink-muted transition-colors duration-150 hover:bg-paper-dim hover:text-ink"
                  aria-label={`Edit ${variant.name}`}
                >
                  <Icon name="edit" className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(variant.id)}
                  className="p-1.5 rounded-lg text-ink-muted transition-colors duration-150 hover:bg-rose hover:text-white"
                  aria-label={`Remove ${variant.name}`}
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="bg-paper-dim rounded-lg p-2.5 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input-field !py-1.5 text-sm"
            placeholder="Color name (e.g. Red)"
            value={draft.variantName}
            onChange={(e) => setDraft((d) => ({ ...d, variantName: e.target.value }))}
          />
          <input
            className="input-field figure !py-1.5 text-sm"
            placeholder="SKU"
            value={draft.sku}
            onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            step="0.01"
            className="input-field figure !py-1.5 text-sm"
            placeholder="Price adjustment (e.g. +200)"
            value={draft.priceAdjustment}
            onChange={(e) => setDraft((d) => ({ ...d, priceAdjustment: e.target.value }))}
          />
          {!editingId && (
            <input
              type="number"
              min="0"
              className="input-field figure !py-1.5 text-sm"
              placeholder="Starting stock"
              value={draft.stock}
              onChange={(e) => setDraft((d) => ({ ...d, stock: e.target.value }))}
            />
          )}
        </div>
        {error && <p className="text-xs text-rose">{error}</p>}
        <div className="flex justify-end gap-2">
          {editingId && (
            <button type="button" onClick={cancelEdit} className="text-xs text-ink-muted px-2">
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="btn-accent !py-1.5 !px-3 text-xs transition-all duration-200 hover:-translate-y-0.5"
          >
            {isSaving ? 'Saving…' : editingId ? 'Update Color' : 'Add Color'}
          </button>
        </div>
      </div>
    </div>
  )
}
