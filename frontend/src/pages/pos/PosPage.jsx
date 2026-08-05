import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProductSearchGrid from '../../components/pos/ProductSearchGrid'
import CartPanel from '../../components/pos/CartPanel'
import Modal from '../../components/common/Modal'
import InvoiceReceipt from '../../components/sales/InvoiceReceipt'
import { printReceiptElement } from '../../utils/printReceipt'
import { useCart } from '../../hooks/useCart'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { salesService } from '../../services/salesService'
import { downloadReceiptPdf } from '../../utils/receiptPdf'

/**
 * Point of Sale page. Implements the required workflow:
 * Search Product -> Add to Cart -> Select Customer -> Change Quantity ->
 * View Total -> Checkout -> Generate Invoice.
 *
 * A cart line can be a plain product, a specific batch of a batch-tracked
 * product (FR: Batch & Lot Tracking), a kit/bundle (FR: Kitting &
 * Bundling), or a box quantity computed by the Area-to-Box calculator
 * (FR: Area-to-Box Calculator) — see ProductSearchGrid for where those are
 * triggered. Checkout pricing automatically switches to wholesale rates
 * server-side if the selected customer is WHOLESALE/CONTRACTOR.
 *
 * Premium pass: the header picks up the same amber accent bar used by
 * `PageHeader` elsewhere (kept as a lightweight custom header here so the
 * fixed-height POS layout below is untouched), and the two panels
 * (ProductSearchGrid, CartPanel) get the shared lift/shine/glow system —
 * see those files for the specifics.
 */
export default function PosPage() {
  const {
    items,
    customer,
    setCustomer,
    addProductItem,
    addKitItem,
    updateQuantity,
    setLineDiscount,
    removeItem,
    clearCart,
    subtotal,
    discountTotal,
    taxTotal,
    total,
    toCheckoutItems,
  } = useCart()
  const navigate = useNavigate()
  const { companyName } = useBusinessSettings()
  const [invoice, setInvoice] = useState(null)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [error, setError] = useState('')

  async function handleCheckout({ paymentMethod, amountPaid, dueDate, installmentPlan }) {
    setError('')
    setIsCheckingOut(true)
    try {
      const res = await salesService.checkout({
        customerId: customer?.id || null,
        items: toCheckoutItems(),
        paymentMethod,
        amountPaid,
        dueDate,
        installmentPlan,
      })
      setInvoice(res.data.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Checkout failed. Please try again.')
    } finally {
      setIsCheckingOut(false)
    }
  }

  function handleCloseInvoice() {
    setInvoice(null)
    clearCart()
  }

  return (
    <div className="h-full flex flex-col">
      <div className="relative z-10 mb-4 flex items-start gap-3">
        <span className="hidden sm:block w-1 h-9 rounded-full bg-gradient-to-b from-amber to-amber-dark mt-0.5 shrink-0" />
        <div>
          <h1 className="page-title">Point of Sale</h1>
          <p className="page-subtitle">Search a product, build the cart, then check out.</p>
          {error && <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2 mt-2">{error}</p>}
        </div>
      </div>

      {/* Below `lg` this is a plain vertical stack that grows with its
          content — no forced height, no clipping — so the page itself
          scrolls (via DashboardLayout's <main>) the same way any other
          page does. Forcing a fixed/equal split here on mobile (as an
          earlier version of this file did) doesn't reliably leave enough
          room for both panels once they're stacked instead of
          side-by-side, and `overflow-hidden` on top of that silently
          clips whatever didn't fit — that's why the cart / checkout
          button could disappear on a short window.

          At `lg` and up it switches to the pinned two-column grid, and
          each panel is wrapped in a div that only gets `lg:h-full` —
          ProductSearchGrid/CartPanel each set `h-full` on their own root,
          which needs a real height to resolve against. On mobile that
          wrapper has no fixed height, so `h-full` inside it correctly
          falls back to the panel's natural content height instead of
          collapsing.

          The left column is `minmax(0,1fr)` rather than a bare `1fr`: a
          bare `1fr` track still has an implicit min width equal to its
          content's min-content size, so it refuses to shrink past that —
          when the sidebar expanded (256px vs its 92px collapsed width),
          there wasn't enough room left for both the shrunk-but-not-enough
          left column AND the fixed 380px cart column, and the whole grid
          (cart panel included) pushed past the right edge of the page.
          `minmax(0, 1fr)` removes that implicit floor so the left column
          — and only the left column — is the one that yields, while the
          380px cart panel stays put and fully on-screen. `lg:min-w-0` on
          both grid-item wrappers backs this up so nothing inside either
          panel (e.g. long product names) re-introduces the same problem. */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px] gap-4 lg:overflow-hidden">
        <div className="lg:h-full lg:min-h-0 lg:min-w-0">
          <ProductSearchGrid onAddProduct={addProductItem} onAddKit={addKitItem} />
        </div>
        <div className="lg:h-full lg:min-h-0 lg:min-w-0">
          <CartPanel
            items={items}
            customer={customer}
            onSelectCustomer={setCustomer}
            onUpdateQuantity={updateQuantity}
            onSetLineDiscount={setLineDiscount}
            onRemoveItem={removeItem}
            subtotal={subtotal}
            discountTotal={discountTotal}
            taxTotal={taxTotal}
            total={total}
            onCheckout={handleCheckout}
            isCheckingOut={isCheckingOut}
          />
        </div>
      </div>

      <Modal
        isOpen={Boolean(invoice)}
        onClose={handleCloseInvoice}
        title={
          invoice?.saleType === 'CREDIT'
            ? 'Sale Complete — Customer Credit'
            : invoice?.saleType === 'INSTALLMENT'
              ? 'Sale Complete — Installment Plan'
              : 'Sale Complete'
        }
        size="sm"
      >
        {invoice && (
          <>
            <InvoiceReceipt invoice={invoice} />
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5"
                onClick={() => printReceiptElement('receipt-print-area')}
              >
                Print
              </button>
              <button
                type="button"
                className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5"
                onClick={() => downloadReceiptPdf(invoice, companyName)}
              >
                Download PDF
              </button>
            </div>
            <button
              type="button"
              className="btn-accent w-full mt-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)]"
              onClick={() => {
                handleCloseInvoice()
                navigate('/sales')
              }}
            >
              Done
            </button>
          </>
        )}
      </Modal>
    </div>
  )
}