
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProductSearchGrid from '../../components/pos/ProductSearchGrid'
import CartPanel from '../../components/pos/CartPanel'
import Modal from '../../components/common/Modal'
import InvoiceReceipt from '../../components/sales/InvoiceReceipt'
import { useCart } from '../../hooks/useCart'
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
  const [invoice, setInvoice] = useState(null)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [error, setError] = useState('')

  async function handleCheckout({ paymentMethod, amountPaid }) {
    setError('')
    setIsCheckingOut(true)
    try {
      const res = await salesService.checkout({
        customerId: customer?.id || null,
        items: toCheckoutItems(),
        paymentMethod,
        amountPaid,
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
          {error && <p className="text-sm text-rose bg-rose-light rounded-lg px-3 py-2 mt-2">{error}</p>}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 min-h-0 overflow-hidden">
        <ProductSearchGrid onAddProduct={addProductItem} onAddKit={addKitItem} />
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

      <Modal isOpen={Boolean(invoice)} onClose={handleCloseInvoice} title="Sale Complete" size="sm">
        {invoice && (
          <>
            <InvoiceReceipt invoice={invoice} />
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5"
                onClick={() => window.print()}
              >
                Print
              </button>
              <button
                type="button"
                className="btn-outline flex-1 transition-all duration-200 hover:-translate-y-0.5"
                onClick={() => downloadReceiptPdf(invoice)}
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
