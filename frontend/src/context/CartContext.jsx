import { createContext, useState, useMemo, useCallback } from 'react'

export const CartContext = createContext(null)

/**
 * CartContext drives the POS workflow: search product -> add to cart ->
 * select customer -> change quantity -> view total -> checkout -> generate
 * invoice.
 *
 * A cart line is one of two kinds:
 *  - product line: { kind: 'product', productId, batchId?, batchLabel?, ... }
 *    batchId is set when the product is batch-tracked (FR: Batch & Lot
 *    Tracking) — two lines for the same product but different batches are
 *    kept separate, since they represent different shades/lots.
 *  - kit line: { kind: 'kit', kitId, ... } (FR: Kitting & Bundling)
 *
 * Every line has a unique `lineId` used as its React key and for
 * updateQuantity/removeItem lookups.
 *
 * Pricing math mirrors sales.service.js on the backend exactly, so the
 * total shown here is always what checkout will actually charge:
 *   grossLineTotal = price * quantity
 *   discountAmount = PERCENTAGE: grossLineTotal * value/100
 *                     FLAT: value * quantity (a per-unit amount)
 *   lineTotal (taxable) = grossLineTotal - discountAmount
 *   tax = lineTotal * gstRate / 100
 * Kit lines are treated as already GST-inclusive and never discounted
 * (kits are priced as a bundle, not built from individually-discountable
 * components) — same as they've always been tax-exempt here.
 *
 * A product line's discount starts as that product's standing default
 * (discountType/discountValue, set by an admin — see ProductFormModal)
 * but can be overridden per sale via setLineDiscount, exactly like GST
 * can't be overridden but discount deliberately can (a cashier haggling
 * on one sale shouldn't need an admin to change the product's default).
 */
export function CartProvider({ children }) {
  const [items, setItems] = useState([])
  const [customer, setCustomer] = useState(null)

  const lineIdFor = (kind, id, variantId, batchId) =>
    kind === 'kit' ? `kit:${id}` : `product:${id}:${variantId || 'none'}:${batchId || 'none'}`

  /** Adds a regular product line. `quantity` lets the Area-to-Box
   *  calculator add a computed box count in one shot instead of clicking
   *  "+1" repeatedly. `batchId`/`batchLabel` come from the batch picker
   *  for batch-tracked products. `variantId`/`variantLabel`/
   *  `variantPriceAdjustment`/`variantStock` come from the color picker
   *  for variant-tracked products — a product can be both at once (see
   *  VariantBatchSelectorModal), in which case a cart line is unique per
   *  color+batch combination, not just per product. */
  const addProductItem = useCallback(
    (
      product,
      { quantity = 1, variantId = null, variantLabel = null, variantPriceAdjustment = 0, variantStock = null, batchId = null, batchLabel = null } = {},
    ) => {
      const lineId = lineIdFor('product', product.id, variantId, batchId)
      // A variant (color) can have its own stock cap tighter than the
      // product's overall stock; fall back to the product's stock when no
      // variant is involved.
      const stockCap = variantStock !== null ? variantStock : product.stock
      setItems((prev) => {
        const existing = prev.find((item) => item.lineId === lineId)
        if (existing) {
          const nextQty = Math.min(existing.quantity + quantity, stockCap)
          return prev.map((item) => (item.lineId === lineId ? { ...item, quantity: nextQty } : item))
        }
        return [
          ...prev,
          {
            lineId,
            kind: 'product',
            productId: product.id,
            variantId,
            variantLabel,
            batchId,
            batchLabel,
            name: product.name,
            sku: product.sku,
            price: product.price + Number(variantPriceAdjustment || 0),
            gstRate: Number(product.gstRate) || 0,
            discountType: product.discountType || 'PERCENTAGE',
            discountValue: Number(product.discountValue) || 0,
            stock: stockCap,
            quantity: Math.min(quantity, stockCap),
          },
        ]
      })
    },
    [],
  )

  /** Adds a kit (bundle) line — priced and sold as one unit, backend
   *  deducts each component product from stock. Kit lines are
   *  GST-inclusive and never discounted, same as before. */
  const addKitItem = useCallback((kit) => {
    const lineId = lineIdFor('kit', kit.id)
    setItems((prev) => {
      const existing = prev.find((item) => item.lineId === lineId)
      if (existing) {
        if (existing.quantity >= kit.availableQty) return prev
        return prev.map((item) => (item.lineId === lineId ? { ...item, quantity: item.quantity + 1 } : item))
      }
      return [
        ...prev,
        {
          lineId,
          kind: 'kit',
          kitId: kit.id,
          name: `${kit.name} (bundle)`,
          sku: kit.sku,
          price: kit.price,
          gstRate: 0,
          discountType: 'PERCENTAGE',
          discountValue: 0,
          stock: kit.availableQty,
          quantity: 1,
        },
      ]
    })
  }, [])

  const updateQuantity = useCallback((lineId, quantity) => {
    setItems((prev) =>
      prev.map((item) => (item.lineId === lineId ? { ...item, quantity: Math.max(1, Math.min(quantity, item.stock)) } : item)),
    )
  }, [])

  /** Overrides the discount for one cart line for this sale only — the
   *  product's own standing default is untouched. */
  const setLineDiscount = useCallback((lineId, { discountType, discountValue }) => {
    setItems((prev) =>
      prev.map((item) =>
        item.lineId === lineId
          ? { ...item, discountType, discountValue: Math.max(0, Number(discountValue) || 0) }
          : item,
      ),
    )
  }, [])

  const removeItem = useCallback((lineId) => {
    setItems((prev) => prev.filter((item) => item.lineId !== lineId))
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
    setCustomer(null)
  }, [])

  /** Per-line computed pricing (gross, discount, taxable, tax) — the
   *  single source of truth CartPanel reads from so every displayed
   *  number and the grand total are always consistent with each other. */
  const pricedItems = useMemo(
    () =>
      items.map((item) => {
        const grossLineTotal = item.price * item.quantity
        let discountAmount = 0
        if (item.kind === 'product') {
          discountAmount =
            item.discountType === 'FLAT'
              ? item.discountValue * item.quantity
              : (grossLineTotal * item.discountValue) / 100
          discountAmount = Math.max(0, Math.min(discountAmount, grossLineTotal))
        }
        const lineTotal = grossLineTotal - discountAmount
        const taxAmount = item.kind === 'kit' ? 0 : (lineTotal * item.gstRate) / 100
        return { ...item, grossLineTotal, discountAmount, lineTotal, taxAmount }
      }),
    [items],
  )

  const subtotal = useMemo(() => pricedItems.reduce((sum, item) => sum + item.grossLineTotal, 0), [pricedItems])
  const discountTotal = useMemo(() => pricedItems.reduce((sum, item) => sum + item.discountAmount, 0), [pricedItems])
  const taxTotal = useMemo(() => pricedItems.reduce((sum, item) => sum + item.taxAmount, 0), [pricedItems])

  // What checkout will actually require as the minimum paid amount —
  // this is the number that should be shown to the cashier as "Total".
  const total = useMemo(
    () => Math.round((subtotal - discountTotal + taxTotal) * 100) / 100,
    [subtotal, discountTotal, taxTotal],
  )

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items])

  /** Shapes the cart into exactly what POST /sales/checkout expects. */
  const toCheckoutItems = useCallback(
    () =>
      items.map((item) =>
        item.kind === 'kit'
          ? { kitId: item.kitId, quantity: item.quantity }
          : {
              productId: item.productId,
              variantId: item.variantId || undefined,
              batchId: item.batchId || undefined,
              quantity: item.quantity,
              discountType: item.discountType,
              discountValue: item.discountValue,
            },
      ),
    [items],
  )

  const value = {
    items: pricedItems,
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
    itemCount,
    toCheckoutItems,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
