import { useState, useEffect } from 'react'
import Icon from '../common/Icon'
import { formatCurrency } from '../../utils/formatters'
import { variationService } from '../../services/variationService'

/**
 * Lets the admin pick which of a Variation's already-defined values apply
 * to a brand-new product (no id yet), and set SKU/stock for each one
 * picked — same role VariantDraftBuilder used to play, except the values
 * themselves are never typed here; they're pulled from whichever
 * Variation was selected in the dropdown above (see VariationsPage.jsx,
 * where they're actually defined/managed).
 *
 * `picks` is a map of variationValueId -> { sku, stock, priceOverride },
 * handed to the parent form so it can send it all to the server in one
 * request alongside the product itself — see ProductFormModal's
 * handleSubmit.
 */
export default function VariantValuePicker({ variationId, picks, onChange, targetStock }) {
  const [variation, setVariation] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!variationId) return
    setIsLoading(true)
    variationService
      .getById(variationId)
      .then((res) => setVariation(res.data.data))
      .finally(() => setIsLoading(false))
  }, [variationId])

  const allocated = Object.values(picks).reduce((sum, p) => sum + Number(p.stock || 0), 0)
  const target = targetStock === '' ? 0 : Number(targetStock)
  const remaining = target - allocated
  const isBalanced = remaining === 0 && Object.keys(picks).length > 0

  function togglePick(value, checked) {
    const next = { ...picks }
    if (checked) {
      next[value.id] = { sku: '', stock: '', priceOverride: '' }
    } else {
      delete next[value.id]
    }
    onChange(next)
    setError('')
  }

  function updatePick(valueId, field, val) {
    onChange({ ...picks, [valueId]: { ...picks[valueId], [field]: val } })
  }

  if (!variationId) return null
  if (isLoading) return <p className="text-sm text-ink-muted dark:text-dark-muted">Loading values…</p>
  if (!variation) return null

  return (
    <div className="rounded-lg border border-line dark:border-dark-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="section-icon bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
          <Icon name="categories" className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">{variation.name} options</p>
      </div>

      <div
        className={`mb-3 rounded-lg px-3 py-2 text-xs font-medium ${
          isBalanced
            ? 'bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal'
            : remaining > 0
              ? 'bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber'
              : 'bg-rose-light dark:bg-dark-rose/15 text-rose dark:text-dark-rose'
        }`}
      >
        Allocated {allocated} / {target}
        {remaining > 0 && ` — ${remaining} unit(s) still need a value picked`}
        {remaining < 0 && ` — ${Math.abs(remaining)} unit(s) over Stock Quantity above`}
        {isBalanced && ' — fully allocated'}
      </div>

      {variation.values.length === 0 ? (
        <p className="text-sm text-ink-muted dark:text-dark-muted">
          This variation has no values yet — add some on the Variations page first.
        </p>
      ) : (
        <ul className="space-y-2">
          {variation.values.map((value) => {
            const picked = picks[value.id]
            const label = `${value.value}${variation.valueType === 'MEASUREMENT' && variation.unit ? ` ${variation.unit}` : ''}`
            return (
              <li key={value.id} className="bg-paper-dim dark:bg-dark-card2 rounded-lg p-2.5">
                <label className="flex items-center gap-2 text-sm text-ink dark:text-dark-text cursor-pointer mb-1">
                  <input
                    type="checkbox"
                    checked={Boolean(picked)}
                    onChange={(e) => togglePick(value, e.target.checked)}
                    className="rounded border-line dark:border-dark-border text-amber focus:ring-amber"
                  />
                  <span className="font-medium">{label}</span>
                  {Number(value.priceAdjustment) !== 0 && (
                    <span className="text-xs text-ink-muted dark:text-dark-muted">
                      ({value.priceAdjustment > 0 ? '+' : ''}
                      {formatCurrency(value.priceAdjustment)})
                    </span>
                  )}
                </label>
                {picked && (
                  <div className="grid grid-cols-3 gap-2 mt-2 pl-6">
                    <input
                      className="input-field figure !py-1.5 text-sm"
                      placeholder="SKU"
                      value={picked.sku}
                      onChange={(e) => updatePick(value.id, 'sku', e.target.value)}
                    />
                    <input
                      type="number"
                      min="0"
                      className="input-field figure !py-1.5 text-sm"
                      placeholder="Stock"
                      value={picked.stock}
                      onChange={(e) => updatePick(value.id, 'stock', e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="input-field figure !py-1.5 text-sm"
                      placeholder="Price override"
                      value={picked.priceOverride}
                      onChange={(e) => updatePick(value.id, 'priceOverride', e.target.value)}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="text-xs text-rose dark:text-dark-rose mt-2">{error}</p>}
    </div>
  )
}
