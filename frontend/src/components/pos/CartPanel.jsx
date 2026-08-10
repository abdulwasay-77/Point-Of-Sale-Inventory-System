import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../common/Icon'
import EmptyState from '../common/EmptyState'
import ConfirmDialog from '../common/ConfirmDialog'
import { formatCurrency } from '../../utils/formatters'
import { customerService } from '../../services/customerService'
import { PAYMENT_METHODS } from '../../utils/constants'

/**
 * Right-hand panel of the POS screen — styled like a paper receipt (the
 * signature element for this app). Handles customer selection, quantity
 * changes, per-line discount overrides, removing lines, and checkout.
 *
 * Pricing: all the math (gross, discount, tax, total) is computed once in
 * CartContext and handed to this component pre-calculated — this file is
 * purely presentation, so there's exactly one place a pricing bug could
 * ever live, and it's the same place the backend's math is mirrored.
 *
 * Layout/scroll: only the "Customer" picker is pinned at the top. Cart
 * items AND the payment/totals/checkout footer share one scroll region
 * below it — nothing scrolls when everything fits, but if the cart is
 * long or the screen is short, that region scrolls together so the
 * checkout button is always reachable, never pushed off the bottom.
 * Scrollbar is hidden (same treatment as the sidebar) — scrolling still
 * works, there's just no visible track.
 */
export default function CartPanel({
  items,
  customer,
  onSelectCustomer,
  onUpdateQuantity,
  onSetLineDiscount,
  onRemoveItem,
  subtotal,
  discountTotal,
  taxTotal,
  total,
  onCheckout,
  isCheckingOut,
  onClearCart,
}) {
  const [customers, setCustomers] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [paidAmount, setPaidAmount] = useState('')
  const [paidTouched, setPaidTouched] = useState(false)
  const [discountEditorLineId, setDiscountEditorLineId] = useState(null)
  const [isEmptyCartConfirmOpen, setIsEmptyCartConfirmOpen] = useState(false)
  // How the remainder (if any) gets handled — FULL means no remainder is
  // allowed at all, same behavior as before these two modules existed.
  const [saleMode, setSaleMode] = useState('FULL')
  const [dueDate, setDueDate] = useState('')
  const [installmentCount, setInstallmentCount] = useState('4')
  const [frequencyDays, setFrequencyDays] = useState('30')
  const paidAmountInputRef = useRef(null)
  const customerSelectRef = useRef(null)
  const paymentMethodSelectRef = useRef(null)
  const [selectedLineId, setSelectedLineId] = useState(null)

  useEffect(() => {
    customerService
      .getAll()
      .then((res) => setCustomers(res.data.data))
      .catch(() => setCustomers([]))
  }, [])

  // Keep "Paid Amount" defaulted to the current total (exact change)
  // until the cashier deliberately edits it.
  useEffect(() => {
    if (!paidTouched) {
      setPaidAmount(total > 0 ? total.toFixed(2) : '')
    }
  }, [total, paidTouched])

  useEffect(() => {
    if (items.length === 0) {
      setPaymentMethod('CASH')
      setPaidAmount('')
      setPaidTouched(false)
      setDiscountEditorLineId(null)
      setSaleMode('FULL')
      setDueDate('')
      setInstallmentCount('4')
      setFrequencyDays('30')
    }
  }, [items.length])

  // Quantity shortcuts only ever affect a cart row the cashier has already
  // focused. This avoids silently changing an arbitrary line after a cart
  // update or while the cashier is editing a form field.
  useEffect(() => {
    setSelectedLineId((currentLineId) => (items.some((item) => item.lineId === currentLineId) ? currentLineId : null))
  }, [items])

  const paidNumber = Number(paidAmount) || 0
  const returnAmount = Math.max(paidNumber - total, 0)
  const shortfall = Math.max(total - paidNumber, 0)
  // Only actually "insufficient" (blocking) when the cashier hasn't
  // opted into Credit or Installments for the remainder — those modes
  // are what unlock a partial payment in the first place.
  const isInsufficient = items.length > 0 && shortfall > 0.001 && saleMode === 'FULL'
  const needsCustomerForMode = saleMode !== 'FULL' && !customer
  const canCheckout =
    items.length > 0 &&
    !isCheckingOut &&
    !isInsufficient &&
    !needsCustomerForMode &&
    !(saleMode === 'CREDIT' && shortfall > 0.001 && !dueDate)

  const handleCheckoutClick = useCallback(() => {
    // The keyboard path uses this same guard and existing checkout action,
    // so it cannot bypass any payment or customer validation.
    if (!canCheckout) return
    const payload = { paymentMethod, amountPaid: paidNumber }
    if (saleMode === 'CREDIT' && shortfall > 0.001) {
      payload.dueDate = dueDate
    }
    if (saleMode === 'INSTALLMENT' && shortfall > 0.001) {
      payload.installmentPlan = {
        installmentCount: Number(installmentCount),
        frequencyDays: Number(frequencyDays),
      }
    }
    onCheckout(payload)
  }, [canCheckout, dueDate, frequencyDays, installmentCount, paidNumber, paymentMethod, saleMode, shortfall, onCheckout])

  useEffect(() => {
    function handleKeyDown(event) {
      // A modal owns keyboard interaction while it is open.
      if (globalThis.document.querySelector('[role="dialog"][aria-modal="true"]')) return

      if (event.key === 'F6' && items.length > 0) {
        event.preventDefault()
        paidAmountInputRef.current?.focus()
        paidAmountInputRef.current?.select()
      }

      if (event.key === 'F3') {
        event.preventDefault()
        customerSelectRef.current?.focus()
      }

      if (event.key === 'F4') {
        event.preventDefault()
        paymentMethodSelectRef.current?.focus()
      }

      if (event.key === 'F7' && items.length > 0) {
        event.preventDefault()
        setIsEmptyCartConfirmOpen(true)
      }

      if (event.key === 'F8') {
        event.preventDefault()
        handleCheckoutClick()
      }

      const target = event.target
      const isEditingField = target?.matches?.('input, textarea, select, [contenteditable="true"]')
      const focusedLineId = target?.closest?.('[data-cart-line-id]')?.dataset.cartLineId
      const selectedItem = items.find((item) => item.lineId === selectedLineId)

      // Cart rows are a two-dimensional keyboard surface: Up/Down moves to
      // the matching action on the previous/next row, while Left/Right moves
      // across actions within the current row. Inputs keep their native keys.
      if (!event.ctrlKey && !isEditingField && focusedLineId) {
        const currentRow = target?.closest?.('[data-cart-line-id]')
        const currentButton = target?.closest?.('button:not([disabled])')
        const direction = event.key
        if (currentRow && currentButton && (direction === 'ArrowLeft' || direction === 'ArrowRight')) {
          const rowButtons = Array.from(currentRow.querySelectorAll('button:not([disabled])'))
          const currentIndex = rowButtons.indexOf(currentButton)
          const nextButton = rowButtons[currentIndex + (direction === 'ArrowLeft' ? -1 : 1)]
          if (nextButton) {
            event.preventDefault()
            nextButton.focus()
            return
          }
        }
        if (currentRow && currentButton && (direction === 'ArrowUp' || direction === 'ArrowDown')) {
          const rows = Array.from(globalThis.document.querySelectorAll('[data-cart-line-id]'))
          const currentIndex = rows.indexOf(currentRow)
          const nextRow = rows[currentIndex + (direction === 'ArrowUp' ? -1 : 1)]
          const nextButton = nextRow?.querySelector('[data-cart-line-anchor]:not([disabled])') || nextRow?.querySelector('button:not([disabled])')
          if (nextButton) {
            event.preventDefault()
            nextButton.focus()
            nextButton.scrollIntoView({ block: 'nearest' })
            return
          }
        }
      }

      if (!event.ctrlKey || isEditingField || !selectedItem || focusedLineId !== selectedLineId) return

      if (event.key === 'ArrowUp' && selectedItem.quantity < selectedItem.stock) {
        event.preventDefault()
        onUpdateQuantity(selectedItem.lineId, selectedItem.quantity + 1)
      }
      if (event.key === 'ArrowDown' && selectedItem.quantity > 1) {
        event.preventDefault()
        onUpdateQuantity(selectedItem.lineId, selectedItem.quantity - 1)
      }
    }

    globalThis.document.addEventListener('keydown', handleKeyDown)
    return () => globalThis.document.removeEventListener('keydown', handleKeyDown)
  }, [handleCheckoutClick, items, onUpdateQuantity, selectedLineId])

  return (
    <div data-pos-navigation-group="cart" className="receipt-panel card-premium glow-amber flex flex-col h-full min-h-0">
      <div className="px-5 pt-5 pb-4 border-b border-dashed border-line dark:border-dark-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="section-icon rounded-lg bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
            <Icon name="pos" className="h-4 w-4" />
          </span>
          <h2 className="font-display text-base font-semibold text-ink dark:text-dark-text">Current Sale</h2>
          {items.length > 0 && (
            <span className="ml-auto badge-amber text-[11px]">
              {items.reduce((n, i) => n + i.quantity, 0)} item{items.reduce((n, i) => n + i.quantity, 0) === 1 ? '' : 's'}
            </span>
          )}
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setIsEmptyCartConfirmOpen(true)}
              className="text-xs font-medium text-ink-muted dark:text-dark-muted hover:text-rose dark:hover:text-dark-rose transition-colors duration-150 flex items-center gap-1"
              title="Remove every item from the current sale"
            >
              <Icon name="close" className="h-3.5 w-3.5" />
              Empty Cart
            </button>
          )}
        </div>

        <div className="mt-3">
          <label className="label-text" htmlFor="pos-customer">
            Customer
          </label>
          <select
            ref={customerSelectRef}
            id="pos-customer"
            className="input-field"
            value={customer?.id || ''}
            onChange={(e) => {
              const selected = customers.find((c) => c.id === e.target.value)
              onSelectCustomer(selected || null)
            }}
          >
            <option value="">Walk-in Customer</option>
            {customers
              .filter((c) => c.name !== 'Walk-in Customer')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="px-5 py-3">
          {items.length === 0 ? (
            <EmptyState
              title="Cart is empty"
              description="Search for a product on the left to start a sale."
              icon="🛒"
            />
          ) : (
            <ul className="divide-y divide-line/70 dark:divide-dark-border/70">
              {items.map((item) => (
                <li
                  key={item.lineId}
                  data-cart-line-id={item.lineId}
                  onFocusCapture={() => setSelectedLineId(item.lineId)}
                  className={`group py-3 -mx-2 px-2 rounded-lg transition-colors duration-200 hover:bg-amber-light/30 dark:hover:bg-amber/15 ${
                    selectedLineId === item.lineId ? 'ring-1 ring-amber/50 bg-amber-light/20 dark:bg-amber/10' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink dark:text-dark-text truncate">
                        {item.name}
                        {item.kind === 'kit' && <span className="ml-1.5 badge-amber align-middle text-[10px]">Bundle</span>}
                      </p>
                      <p className="text-xs text-ink-muted dark:text-dark-muted figure">
                        {item.sku}
                        {item.variantLabel && <span className="ml-1.5 text-ink-muted dark:text-dark-muted">· {item.variantLabel}</span>}
                        {item.batchLabel && <span className="ml-1.5 text-ink-muted dark:text-dark-muted">· {item.batchLabel}</span>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.lineId)}
                      className="text-ink-muted dark:text-dark-muted shrink-0 p-1 rounded-full transition-all duration-200 hover:text-white hover:bg-rose dark:hover:bg-dark-rose hover:rotate-90"
                      aria-label={`Remove ${item.name} from cart`}
                    >
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center border border-line dark:border-dark-border rounded-lg overflow-hidden bg-white dark:bg-dark-card">
                      <button
                        type="button"
                        data-cart-line-anchor
                        className="px-2.5 py-1 text-ink-muted dark:text-dark-muted transition-colors duration-150 hover:bg-paper-dim dark:hover:bg-dark-card2 hover:text-ink dark:hover:text-dark-text"
                        onClick={() => onUpdateQuantity(item.lineId, item.quantity - 1)}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="figure text-sm w-8 text-center">{item.quantity}</span>
                      <button
                        type="button"
                        className="px-2.5 py-1 text-ink-muted dark:text-dark-muted transition-colors duration-150 hover:bg-paper-dim dark:hover:bg-dark-card2 hover:text-ink dark:hover:text-dark-text disabled:opacity-30"
                        onClick={() => onUpdateQuantity(item.lineId, item.quantity + 1)}
                        disabled={item.quantity >= item.stock}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-right">
                      {item.discountAmount > 0 && (
                        <p className="figure text-xs text-ink-muted dark:text-dark-muted line-through leading-tight">
                          {formatCurrency(item.grossLineTotal)}
                        </p>
                      )}
                      <span className="figure text-sm font-semibold text-ink dark:text-dark-text">{formatCurrency(item.lineTotal)}</span>
                    </div>
                  </div>

                  {/* Per-line discount — product's own default until the
                      cashier overrides it for this sale. Kits aren't
                      discountable (priced as a bundle already). */}
                  {item.kind === 'product' && (
                    <div className="mt-1.5">
                      {discountEditorLineId === item.lineId ? (
                        <div className="flex items-center gap-1.5">
                          <select
                            className="input-field !py-1 !px-1.5 text-xs w-[88px] shrink-0"
                            value={item.discountType}
                            onChange={(e) => onSetLineDiscount(item.lineId, { discountType: e.target.value, discountValue: item.discountValue })}
                            aria-label="Discount type"
                          >
                            <option value="PERCENTAGE">% off</option>
                            <option value="FLAT">Flat off</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input-field figure !py-1 !px-2 text-xs flex-1"
                            value={item.discountValue}
                            onChange={(e) => onSetLineDiscount(item.lineId, { discountType: item.discountType, discountValue: e.target.value })}
                            aria-label="Discount value"
                          />
                          <button
                            type="button"
                            onClick={() => setDiscountEditorLineId(null)}
                            className="text-xs text-teal-dark dark:text-dark-teal font-medium px-1.5 shrink-0"
                          >
                            Done
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDiscountEditorLineId(item.lineId)}
                          className="text-xs text-ink-muted dark:text-dark-muted hover:text-amber-dark dark:hover:text-amber transition-colors duration-150 flex items-center gap-1"
                        >
                          <Icon name="edit" className="h-3 w-3" />
                          {item.discountValue > 0
                            ? `Discount: ${item.discountType === 'FLAT' ? formatCurrency(item.discountValue) + '/unit' : item.discountValue + '%'}`
                            : 'Add discount'}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-4 border-t border-dashed border-line dark:border-dark-border">
          <div className="mb-3">
            <label className="label-text" htmlFor="pos-payment-method">
              Payment Method
            </label>
            <select
              ref={paymentMethodSelectRef}
              id="pos-payment-method"
              className="input-field"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-ink-muted dark:text-dark-muted">Subtotal</span>
            <span className="figure text-sm text-ink dark:text-dark-text">{formatCurrency(subtotal)}</span>
          </div>

          {discountTotal > 0 && (
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-teal-dark dark:text-dark-teal">Discount</span>
              <span className="figure text-sm text-teal-dark dark:text-dark-teal">−{formatCurrency(discountTotal)}</span>
            </div>
          )}

          {taxTotal > 0 && (
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-ink-muted dark:text-dark-muted">Tax (CGST + SGST)</span>
              <span className="figure text-sm text-ink dark:text-dark-text">{formatCurrency(taxTotal)}</span>
            </div>
          )}

          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-ink-muted dark:text-dark-muted">Total Amount</span>
            <span className="figure text-lg font-semibold text-ink dark:text-dark-text">{formatCurrency(total)}</span>
          </div>

          <div className="flex items-center justify-between mb-1.5 gap-3">
            <label htmlFor="pos-paid-amount" className="text-sm text-ink-muted dark:text-dark-muted shrink-0">
              Paid Amount
            </label>
            <input
              ref={paidAmountInputRef}
              id="pos-paid-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className={`input-field figure text-right !py-1.5 ${isInsufficient ? 'border-rose dark:border-dark-rose focus:border-rose dark:focus:border-dark-rose' : ''}`}
              value={paidAmount}
              onChange={(e) => {
                setPaidTouched(true)
                setPaidAmount(e.target.value)
              }}
              disabled={items.length === 0}
            />
          </div>

          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-ink-muted dark:text-dark-muted">Return Amount</span>
            <span className="figure text-lg font-semibold text-teal-dark dark:text-dark-teal">{formatCurrency(returnAmount)}</span>
          </div>

          {shortfall > 0.001 && items.length > 0 && (
            <div className="mb-3 rounded-lg border border-line dark:border-dark-border p-2.5 bg-paper-dim dark:bg-dark-card2">
              <p className="text-xs font-semibold text-ink-muted dark:text-dark-muted uppercase tracking-wide mb-2">
                {formatCurrency(shortfall)} short of the total — how should the rest be handled?
              </p>
              <div className="flex gap-1.5 mb-2">
                {[
                  { value: 'FULL', label: 'Block (default)' },
                  { value: 'CREDIT', label: 'Credit' },
                  { value: 'INSTALLMENT', label: 'Installments' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSaleMode(opt.value)}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${
                      saleMode === opt.value ? 'bg-amber text-white' : 'bg-white dark:bg-dark-card text-ink-muted dark:text-dark-muted border border-line dark:border-dark-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {saleMode !== 'FULL' && !customer && (
                <p className="text-xs text-rose dark:text-dark-rose mb-2">Select a customer above — a walk-in sale can&apos;t carry a balance.</p>
              )}

              {saleMode === 'CREDIT' && (
                <div>
                  <label htmlFor="pos-due-date" className="text-xs text-ink-muted dark:text-dark-muted">
                    Due date
                  </label>
                  <input
                    id="pos-due-date"
                    type="date"
                    className="input-field !py-1.5 text-sm w-full"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                  />
                </div>
              )}

              {saleMode === 'INSTALLMENT' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="pos-installment-count" className="text-xs text-ink-muted dark:text-dark-muted">
                      Number of installments
                    </label>
                    <input
                      id="pos-installment-count"
                      type="number"
                      min="1"
                      className="input-field figure !py-1.5 text-sm w-full"
                      value={installmentCount}
                      onChange={(e) => setInstallmentCount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="pos-frequency-days" className="text-xs text-ink-muted dark:text-dark-muted">
                      Days between each
                    </label>
                    <input
                      id="pos-frequency-days"
                      type="number"
                      min="1"
                      className="input-field figure !py-1.5 text-sm w-full"
                      value={frequencyDays}
                      onChange={(e) => setFrequencyDays(e.target.value)}
                    />
                  </div>
                  <p className="col-span-2 text-xs text-ink-muted dark:text-dark-muted">
                    The down payment above (paid amount) must meet the minimum % set in Settings.
                  </p>
                </div>
              )}
            </div>
          )}

          {isInsufficient && (
            <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mb-3">
              Payment not processed — paid amount is less than the total due. Pick Credit or Installments above to
              accept a partial payment.
            </p>
          )}

          <button
            type="button"
            className="btn-accent w-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)] disabled:hover:translate-y-0 disabled:hover:shadow-none"
            disabled={
              !canCheckout
            }
            onClick={handleCheckoutClick}
          >
            {isCheckingOut ? 'Processing…' : 'Checkout'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isEmptyCartConfirmOpen}
        onClose={() => setIsEmptyCartConfirmOpen(false)}
        onConfirm={onClearCart}
        title="Empty the cart?"
        message="This removes every item from the current sale."
        confirmLabel="Empty Cart"
        keyboardNavigation
      />
    </div>
  )
}
