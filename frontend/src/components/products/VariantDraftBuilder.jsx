import { useState } from 'react'
import Icon from '../common/Icon'
import { formatCurrency } from '../../utils/formatters'

const emptyDraft = { variantName: '', sku: '', priceAdjustment: '', stock: '' }

/**
 * Color-drafting list for a brand-new product (no id yet, so nothing here
 * can hit the API the way VariantManager does for an existing product —
 * see that component for the edit-mode equivalent). Everything is kept in
 * local state and handed to the parent form via onChange; the parent
 * sends it all to the server in one request alongside the product itself,
 * so the product and its colors are created together, in one step, in one
 * transaction — no more "save the product first, then reopen it to add
 * colors."
 *
 * Also enforces, in the UI, that colors add up to exactly the Stock
 * Quantity entered above — the same rule the backend enforces — so the
 * mismatch is caught before Save is even clicked, not after a rejected
 * request. This is what prevents a chunk of the entered stock from ending
 * up in a colorless pool that POS's color picker can never sell.
 */
export default function VariantDraftBuilder({ variants, onChange, targetStock }) {
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState('')

  const allocated = variants.reduce((sum, v) => sum + Number(v.stock || 0), 0)
  const target = targetStock === '' ? 0 : Number(targetStock)
  const remaining = target - allocated
  const isBalanced = remaining === 0 && variants.length > 0

  function addDraft() {
    if (!draft.variantName.trim()) {
      setError('Color name is required.')
      return
    }
    if (!draft.sku.trim()) {
      setError('Each color needs its own SKU.')
      return
    }
    const stock = draft.stock === '' ? 0 : Number(draft.stock)
    if (stock < 0) {
      setError('Stock cannot be negative.')
      return
    }
    setError('')
    onChange([
      ...variants,
      {
        tempId: `${Date.now()}-${Math.random()}`,
        variantName: draft.variantName.trim(),
        sku: draft.sku.trim().toUpperCase(),
        priceAdjustment: draft.priceAdjustment === '' ? 0 : Number(draft.priceAdjustment),
        stock,
      },
    ])
    setDraft(emptyDraft)
  }

  function removeDraft(tempId) {
    onChange(variants.filter((v) => v.tempId !== tempId))
  }

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="section-icon bg-amber-light text-amber-dark">
          <Icon name="categories" className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Color Options</p>
      </div>

      <div
        className={`mb-3 rounded-lg px-3 py-2 text-xs font-medium ${
          isBalanced
            ? 'bg-teal-light text-teal-dark'
            : remaining > 0
              ? 'bg-amber-light text-amber-dark'
              : 'bg-rose-light text-rose'
        }`}
      >
        Allocated {allocated} / {target} to colors
        {remaining > 0 && ` — ${remaining} unit(s) still need a color`}
        {remaining < 0 && ` — ${Math.abs(remaining)} unit(s) over Stock Quantity above`}
        {isBalanced && ' — fully allocated'}
      </div>

      {variants.length > 0 && (
        <ul className="divide-y divide-line/70 mb-3">
          {variants.map((v) => (
            <li key={v.tempId} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{v.variantName}</p>
                <p className="text-xs text-ink-muted figure">
                  {v.sku} · {v.stock} in stock
                  {v.priceAdjustment !== 0 && (
                    <span className="ml-1">
                      · {v.priceAdjustment > 0 ? '+' : ''}
                      {formatCurrency(v.priceAdjustment)}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeDraft(v.tempId)}
                className="p-1.5 rounded-lg text-ink-muted transition-colors duration-150 hover:bg-rose hover:text-white shrink-0"
                aria-label={`Remove ${v.variantName}`}
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
              </button>
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
          <input
            type="number"
            min="0"
            className="input-field figure !py-1.5 text-sm"
            placeholder="Stock for this color"
            value={draft.stock}
            onChange={(e) => setDraft((d) => ({ ...d, stock: e.target.value }))}
          />
        </div>
        {error && <p className="text-xs text-rose">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={addDraft}
            className="btn-accent !py-1.5 !px-3 text-xs transition-all duration-200 hover:-translate-y-0.5"
          >
            Add Color
          </button>
        </div>
      </div>
    </div>
  )
}