import { useState, useEffect } from 'react'
import Icon from '../common/Icon'
import { formatCurrency } from '../../utils/formatters'
import { productService } from '../../services/productService'
import { variationService } from '../../services/variationService'

const emptyDraft = { valueIds: {}, sku: '', priceOverride: '', stock: '' }

/**
 * Manages the specific combinations a product actually sells (e.g. "Red,
 * Medium" combining the Color and Size Variations at once) — a
 * deliberate customer choice, not the same thing as a batch (see the
 * ProductVariant model comment in schema.prisma). Values themselves are
 * NOT created here — they're picked from the product's attached
 * Variations, each defined once on the Variations page and reused
 * across products (see VariationsPage.jsx). A product can use one or
 * several Variations at once; `draft.valueIds` holds one picked value
 * per attached Variation (keyed by variationId) until "Add Combination"
 * turns it into a real saved variant.
 *
 * Each combination is saved immediately when added/edited (not batched
 * up with the rest of the product form) since it needs its own stock
 * record created server-side — same reasoning as why barcode generation
 * saves immediately for an existing product elsewhere in this form.
 */
export default function VariantManager({ productId, variationIds, onVariantsChanged }) {
  const [variants, setVariants] = useState([])
  const [variations, setVariations] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setIsLoading(true)
    Promise.all([
      productService.getVariants(productId),
      Promise.all(variationIds.map((id) => variationService.getById(id).then((res) => res.data.data))),
    ])
      .then(([variantsRes, variationResults]) => {
        setVariants(variantsRes.data.data)
        setVariations(variationResults)
        // Tell sibling panels (e.g. BatchManager, which scopes batches
        // per variant) that the set of variants may have changed, so
        // they can refetch their own copy instead of holding a stale
        // list from whenever they last mounted.
        onVariantsChanged?.()
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, variationIds.join(',')])

  function comboKey(valueIds) {
    return [...valueIds].sort().join('|')
  }

  // Combinations already added on this product — the only check that
  // matters before allowing another "Add Combination"; unlike the
  // single-axis version, an individual value (e.g. "Red") can validly
  // reappear across several different combinations ("Red, Small" and
  // "Red, Medium" are both fine), so this compares full combination
  // sets, not individual values.
  const usedCombos = new Set(variants.map((v) => comboKey(v.variationValueIds)))

  function startEdit(variant) {
    setEditingId(variant.id)
    const valueIds = {}
    for (const v of variant.values) valueIds[v.variationId] = v.variationValueId
    setDraft({ valueIds, sku: variant.sku, priceOverride: variant.priceOverride ?? '', stock: '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(emptyDraft)
    setError('')
  }

  async function handleSave() {
    const valueIds = variations.map((v) => draft.valueIds[v.id]).filter(Boolean)
    if (!editingId) {
      if (valueIds.length !== variations.length) {
        setError(`Pick a value for every Variation (${variations.map((v) => v.name).join(', ')}) first.`)
        return
      }
      if (usedCombos.has(comboKey(valueIds))) {
        setError('This exact combination already exists on this product.')
        return
      }
    }
    if (!draft.sku.trim()) {
      setError('Each combination needs its own SKU.')
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
          variationValueIds: valueIds,
          sku: draft.sku.trim().toUpperCase(),
          priceOverride: draft.priceOverride === '' ? null : draft.priceOverride,
          stock: draft.stock === '' ? 0 : draft.stock,
        })
      }
      cancelEdit()
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save this combination.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemove(variantId) {
    if (!window.confirm('Remove this combination? Existing sales history is kept either way.')) return
    await productService.removeVariant(productId, variantId)
    load()
  }

  const axesLabel = variations.map((v) => v.name).join(' + ') || 'variant'

  return (
    <div className="rounded-lg border border-line dark:border-dark-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="section-icon bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
          <Icon name="categories" className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">{axesLabel} combinations</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-muted dark:text-dark-muted">Loading…</p>
      ) : variants.length === 0 ? (
        <p className="text-sm text-ink-muted dark:text-dark-muted mb-3">No combinations added yet.</p>
      ) : (
        <ul className="divide-y divide-line/70 dark:divide-dark-border/70 mb-3">
          {variants.map((variant) => (
            <li key={variant.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{variant.name}</p>
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
            Editing {variants.find((v) => v.id === editingId)?.name} — the combination itself can't be changed;
            remove and re-add if you picked the wrong values.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {variations.map((v) => (
              <select
                key={v.id}
                className="input-field !py-1.5 text-sm flex-1 min-w-[110px]"
                value={draft.valueIds[v.id] || ''}
                onChange={(e) => setDraft((d) => ({ ...d, valueIds: { ...d.valueIds, [v.id]: e.target.value } }))}
              >
                <option value="">{v.name}…</option>
                {v.values.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.value}
                    {v.valueType === 'MEASUREMENT' && v.unit ? ` ${v.unit}` : ''}
                    {Number(value.priceAdjustment) !== 0 ? ` (${value.priceAdjustment > 0 ? '+' : ''}${value.priceAdjustment})` : ''}
                  </option>
                ))}
              </select>
            ))}
          </div>
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
            {isSaving ? 'Saving…' : editingId ? 'Update Combination' : 'Add Combination'}
          </button>
        </div>
      </div>
    </div>
  )
}