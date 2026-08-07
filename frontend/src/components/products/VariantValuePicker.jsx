import { useState, useEffect } from 'react'
import Icon from '../common/Icon'
import { formatCurrency } from '../../utils/formatters'
import { variationService } from '../../services/variationService'

/**
 * Lets the admin build the actual stocked combinations for a brand-new
 * product (no id yet) that uses one or more Variations at once — e.g.
 * "Red, Medium" from Color + Size. One value is picked per attached
 * Variation, then "Add Combination" turns that into a real row with its
 * own SKU/stock/price override, the same way a real retailer builds out
 * a size/color grid — not every theoretical combination is created,
 * only the ones actually stocked.
 *
 * `picks` is an ARRAY of { valueIds: [...], sku, stock, priceOverride },
 * one entry per real combination, handed to the parent form so it can
 * send the whole list to the server in one request alongside the
 * product itself — see ProductFormModal's handleSubmit.
 */
export default function VariantValuePicker({ variationIds, picks, onChange, targetStock }) {
  const [variations, setVariations] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [current, setCurrent] = useState({}) // variationId -> valueId, the in-progress combination
  const [error, setError] = useState('')

  useEffect(() => {
    if (!variationIds || variationIds.length === 0) return
    setIsLoading(true)
    Promise.all(variationIds.map((id) => variationService.getById(id).then((res) => res.data.data)))
      .then((results) => {
        setVariations(results)
        setCurrent({})
      })
      .finally(() => setIsLoading(false))
  }, [variationIds])

  const allocated = picks.reduce((sum, p) => sum + Number(p.stock || 0), 0)
  const target = targetStock === '' ? 0 : Number(targetStock)
  const remaining = target - allocated
  const isBalanced = remaining === 0 && picks.length > 0

  function comboKey(valueIds) {
    return [...valueIds].sort().join('|')
  }

  function addCombination() {
    setError('')
    const valueIds = variations.map((v) => current[v.id]).filter(Boolean)
    if (valueIds.length !== variations.length) {
      setError(`Pick a value for every Variation (${variations.map((v) => v.name).join(', ')}) before adding.`)
      return
    }
    const key = comboKey(valueIds)
    if (picks.some((p) => comboKey(p.valueIds) === key)) {
      setError('This exact combination is already added below.')
      return
    }
    onChange([...picks, { valueIds, sku: '', stock: '', priceOverride: '' }])
    setCurrent({})
  }

  function updatePick(index, field, val) {
    const next = [...picks]
    next[index] = { ...next[index], [field]: val }
    onChange(next)
  }

  function removePick(index) {
    onChange(picks.filter((_, i) => i !== index))
  }

  function labelFor(variation, valueId) {
    const value = variation.values.find((v) => v.id === valueId)
    if (!value) return ''
    return `${value.value}${variation.valueType === 'MEASUREMENT' && variation.unit ? ` ${variation.unit}` : ''}`
  }

  function comboLabel(valueIds) {
    return variations
      .map((v, i) => labelFor(v, valueIds[i] ?? valueIds.find((id) => v.values.some((val) => val.id === id))))
      .filter(Boolean)
      .join(' / ')
  }

  if (!variationIds || variationIds.length === 0) return null
  if (isLoading) return <p className="text-sm text-ink-muted dark:text-dark-muted">Loading values…</p>
  if (variations.length === 0) return null

  const missingValues = variations.filter((v) => v.values.length === 0)

  return (
    <div className="rounded-lg border border-line dark:border-dark-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="section-icon bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
          <Icon name="categories" className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide">
          {variations.map((v) => v.name).join(' + ')} combinations
        </p>
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
        {remaining > 0 && ` — ${remaining} unit(s) still need a combination picked`}
        {remaining < 0 && ` — ${Math.abs(remaining)} unit(s) over Stock Quantity above`}
        {isBalanced && ' — fully allocated'}
      </div>

      {missingValues.length > 0 ? (
        <p className="text-sm text-ink-muted dark:text-dark-muted">
          {missingValues.map((v) => v.name).join(', ')} — no values yet. Add some on the Variations page first.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2 mb-3">
            {variations.map((v) => (
              <div key={v.id} className="flex-1 min-w-[120px]">
                <label className="label-text !mb-1" htmlFor={`combo-${v.id}`}>{v.name}</label>
                <select
                  id={`combo-${v.id}`}
                  className="input-field !py-1.5 text-sm"
                  value={current[v.id] || ''}
                  onChange={(e) => setCurrent((prev) => ({ ...prev, [v.id]: e.target.value }))}
                >
                  <option value="">Pick {v.name}…</option>
                  {v.values.map((value) => (
                    <option key={value.id} value={value.id}>
                      {labelFor(v, value.id)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button type="button" className="btn-outline !py-1.5 text-sm shrink-0" onClick={addCombination}>
              + Add Combination
            </button>
          </div>

          {picks.length === 0 ? (
            <p className="text-sm text-ink-muted dark:text-dark-muted">No combinations added yet.</p>
          ) : (
            <ul className="space-y-2">
              {picks.map((pick, index) => (
                <li key={comboKey(pick.valueIds)} className="bg-paper-dim dark:bg-dark-card2 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-ink dark:text-dark-text">{comboLabel(pick.valueIds)}</span>
                    <button
                      type="button"
                      onClick={() => removePick(index)}
                      className="text-ink-muted dark:text-dark-muted hover:text-rose dark:hover:text-dark-rose"
                      aria-label="Remove combination"
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <input
                      className="input-field figure !py-1.5 text-sm"
                      placeholder="SKU"
                      value={pick.sku}
                      onChange={(e) => updatePick(index, 'sku', e.target.value)}
                    />
                    <input
                      type="number"
                      min="0"
                      className="input-field figure !py-1.5 text-sm"
                      placeholder="Stock"
                      value={pick.stock}
                      onChange={(e) => updatePick(index, 'stock', e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="input-field figure !py-1.5 text-sm"
                      placeholder="Price override"
                      value={pick.priceOverride}
                      onChange={(e) => updatePick(index, 'priceOverride', e.target.value)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p className="text-xs text-rose dark:text-dark-rose mt-2">{error}</p>}
    </div>
  )
}
