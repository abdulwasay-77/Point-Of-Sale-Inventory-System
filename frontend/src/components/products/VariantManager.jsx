import { useState, useEffect } from 'react'
import Icon from '../common/Icon'
import { formatCurrency } from '../../utils/formatters'
import { productService } from '../../services/productService'
import { variationService } from '../../services/variationService'

const emptyDraft = { variationValueId: '', sku: '', priceOverride: '', stock: '' }

/**
 * Manages the specific values a product actually sells (e.g. "Red" under
 * the "Color" variation) — a deliberate customer choice, not the same
 * thing as a batch (see the ProductVariant model comment in
 * schema.prisma). Values themselves are NOT created here — they're
 * picked from the product's attached Variation, which is defined once on
 * the Variations page and reused across products (see VariationsPage.jsx).
 *
 * Each variant is saved immediately when added/edited (not batched up
 * with the rest of the product form) since it needs its own stock record
 * created server-side — same reasoning as why barcode generation saves
 * immediately for an existing product elsewhere in this form.
 */
export default function VariantManager({ productId, variationId }) {
  const [variants, setVariants] = useState([])
  const [variation, setVariation] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setIsLoading(true)
    Promise.all([productService.getVariants(productId), variationService.getById(variationId)])
      .then(([variantsRes, variationRes]) => {
        setVariants(variantsRes.data.data)
        setVariation(variationRes.data.data)
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, variationId])

  // Values not yet added as a variant on this product — the only ones
  // that make sense to offer when adding a new one.
  const usedValueIds = new Set(variants.map((v) => v.variationValueId))
  const availableValues = (variation?.values || []).filter((v) => !usedValueIds.has(v.id))

  function startEdit(variant) {
    setEditingId(variant.id)
    setDraft({ variationValueId: variant.variationValueId, sku: variant.sku, priceOverride: variant.priceOverride ?? '', stock: '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(emptyDraft)
    setError('')
  }

  async function handleSave() {
    if (!editingId && !draft.variationValueId) {
      setError('Pick a value first.')
      return
    }
    if (!draft.sku.trim()) {
      setError('Each value needs its own SKU.')
      return
    }
    setError('')
    setIsSaving(true)
    try {
      if (editingId) {
        await productService.updateVariant(productId, editingId, {
          sku: draft.sku.trim().toUpperCase(),
          priceOverride: draft.priceOverride === '' ? null : draft.priceOverride,
        })
      } else {
        await productService.createVariant(productId, {
          variationValueId: draft.variationValueId,
          sku: draft.sku.trim().toUpperCase(),
          priceOverride: draft.priceOverride === '' ? null : draft.priceOverride,
          stock: draft.stock === '' ? 0 : draft.stock,
        })
      }
      cancelEdit()
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save this value.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemove(variantId) {
    if (!window.confirm('Remove this value? Existing sales history is kept either way.')) return
    await productService.removeVariant(productId, variantId)
    load()
  }

  const variationName = variation?.name || 'variant'

  return (
    <div className="rounded-lg border border-line dark:border-dark-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="section-icon bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
          <Icon name="categories" className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">{variationName} options</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-muted dark:text-dark-muted">Loading…</p>
      ) : variants.length === 0 ? (
        <p className="text-sm text-ink-muted dark:text-dark-muted mb-3">No {variationName.toLowerCase()} values added yet.</p>
      ) : (
        <ul className="divide-y divide-line/70 dark:divide-dark-border/70 mb-3">
          {variants.map((variant) => (
            <li key={variant.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink dark:text-dark-text truncate">
                  {variant.name}
                  {variation?.valueType === 'MEASUREMENT' && variation?.unit ? ` ${variation.unit}` : ''}
                </p>
                <p className="text-xs text-ink-muted dark:text-dark-muted figure">
                  {variant.sku} · {variant.stock} in stock
                  {variant.priceAdjustment !== 0 && (
                    <span className="ml-1">
                      · {variant.priceAdjustment > 0 ? '+' : ''}
                      {formatCurrency(variant.priceAdjustment)}
                      {variant.priceOverride !== null && <span className="ml-1">(override)</span>}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(variant)}
                  className="p-1.5 rounded-lg text-ink-muted dark:text-dark-muted transition-colors duration-150 hover:bg-paper-dim dark:hover:bg-dark-card2 hover:text-ink dark:hover:text-dark-text"
                  aria-label={`Edit ${variant.name}`}
                >
                  <Icon name="edit" className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(variant.id)}
                  className="p-1.5 rounded-lg text-ink-muted dark:text-dark-muted transition-colors duration-150 hover:bg-rose dark:hover:bg-dark-rose hover:text-white"
                  aria-label={`Remove ${variant.name}`}
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="bg-paper-dim dark:bg-dark-card2 rounded-lg p-2.5 space-y-2">
        {editingId ? (
          <p className="text-xs text-ink-muted dark:text-dark-muted">
            Editing {variants.find((v) => v.id === editingId)?.name} — the value itself can't be changed; remove and
            re-add if you picked the wrong one.
          </p>
        ) : (
          <select
            className="input-field !py-1.5 text-sm"
            value={draft.variationValueId}
            onChange={(e) => setDraft((d) => ({ ...d, variationValueId: e.target.value }))}
          >
            <option value="">Pick a {variationName.toLowerCase()} value…</option>
            {availableValues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.value}
                {variation?.valueType === 'MEASUREMENT' && variation?.unit ? ` ${variation.unit}` : ''}
                {Number(v.priceAdjustment) !== 0 ? ` (${v.priceAdjustment > 0 ? '+' : ''}${v.priceAdjustment})` : ''}
              </option>
            ))}
          </select>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input-field figure !py-1.5 text-sm"
            placeholder="SKU"
            value={draft.sku}
            onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
          />
          <input
            type="number"
            step="0.01"
            className="input-field figure !py-1.5 text-sm"
            placeholder="Price override (optional)"
            value={draft.priceOverride}
            onChange={(e) => setDraft((d) => ({ ...d, priceOverride: e.target.value }))}
          />
        </div>
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
        {error && <p className="text-xs text-rose dark:text-dark-rose">{error}</p>}
        <div className="flex justify-end gap-2">
          {editingId && (
            <button type="button" onClick={cancelEdit} className="text-xs text-ink-muted dark:text-dark-muted px-2">
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="btn-accent !py-1.5 !px-3 text-xs transition-all duration-200 hover:-translate-y-0.5"
          >
            {isSaving ? 'Saving…' : editingId ? 'Update Value' : 'Add Value'}
          </button>
        </div>
      </div>
    </div>
  )
}
