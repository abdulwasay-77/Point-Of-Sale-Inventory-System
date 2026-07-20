
import { useState, useMemo, useEffect, useCallback } from 'react'
import SearchInput from '../common/SearchInput'
import EmptyState from '../common/EmptyState'
import Loading from '../common/Loading'
import Icon from '../common/Icon'
import { formatCurrency } from '../../utils/formatters'
import { productService } from '../../services/productService'
import { kitService } from '../../services/kitService'
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner'
import BatchSelectorModal from './BatchSelectorModal'
import AreaToBoxModal from './AreaToBoxModal'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api$/, '')
function toImageUrl(path) {
  if (!path) return null
  return path.startsWith('http') ? path : `${API_ORIGIN}${path}`
}

/**
 * Left-hand panel of the POS screen. Two tabs:
 *  - Products: search/scan a product and add it to the cart. Batch-tracked
 *    products (FR: Batch & Lot Tracking) open a batch picker instead of
 *    adding directly; products with a box coverage set (FR: Area-to-Box
 *    Calculator) get a calculator shortcut alongside the regular add.
 *  - Kits: sell a bundle (FR: Kitting & Bundling) as one line.
 *
 * A product can be BOTH batch-tracked AND have a box-coverage calculator
 * (e.g. ceramic tiles sold by the box, where each shipment/lot can have a
 * slightly different shade). In that case the two flows are chained: the
 * area calculator only computes a quantity, it never adds to the cart by
 * itself — for a batch-tracked product it hands off to the batch picker
 * with that quantity pre-filled, so the cart line always ends up with both
 * a quantity AND a batchId. Without a batchId, checkout is rejected by the
 * backend for batch-tracked products, so this hand-off is required, not
 * just a nicety.
 *
 * Also listens for a physical barcode scanner (see useBarcodeScanner) —
 * works with any USB/Bluetooth HID scanner automatically, nothing to
 * configure.
 *
 * Premium pass: the panel itself is now a `card-premium`, the Products/
 * Bundles tab switcher matches the sidebar's active-item treatment, and
 * every product/kit tile gets the shared shine-sweep + icon-pop treatment
 * on hover instead of a flat border-color change — so the busiest, most
 * frequently-used screen in the app feels as "alive" as the Dashboard.
 *
 * The tile grid scrolls internally (independent from the cart panel next
 * to it) with the scrollbar hidden, same treatment as the sidebar nav.
 */
export default function ProductSearchGrid({ onAddProduct, onAddKit }) {
  const [tab, setTab] = useState('products')
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [products, setProducts] = useState([])
  const [kits, setKits] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [scanFeedback, setScanFeedback] = useState(null)
  const [batchModalProduct, setBatchModalProduct] = useState(null)
  const [batchModalInitialQty, setBatchModalInitialQty] = useState(1)
  const [areaModalProduct, setAreaModalProduct] = useState(null)

  useEffect(() => {
    Promise.all([productService.getAll(), kitService.getAll()])
      .then(([productsRes, kitsRes]) => {
        setProducts(productsRes.data.data)
        setKits(kitsRes.data.data)
      })
      .finally(() => setIsLoading(false))
  }, [])

  function handleProductClick(product) {
    if (product.isBatchTracked) {
      setBatchModalInitialQty(1)
      setBatchModalProduct(product)
    } else {
      onAddProduct(product)
    }
  }

  const handleScan = useCallback(
    async (code) => {
      try {
        const res = await productService.lookupByCode(code)
        const product = res.data.data
        if (product.isBatchTracked) {
          setBatchModalInitialQty(1)
          setBatchModalProduct(product)
          setScanFeedback({ ok: true, text: `"${product.name}" scanned — pick a batch` })
        } else {
          onAddProduct(product)
          setScanFeedback({ ok: true, text: `Added "${product.name}" from scan` })
        }
      } catch {
        setScanFeedback({ ok: false, text: `No product matches barcode "${code}"` })
      }
      setTimeout(() => setScanFeedback(null), 3000)
    },
    [onAddProduct],
  )

  useBarcodeScanner(handleScan, { enabled: true })

  const categories = useMemo(() => {
    const names = new Set(products.map((p) => p.category).filter(Boolean))
    return ['all', ...Array.from(names).sort()]
  }, [products])

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          (activeCategory === 'all' || p.category === activeCategory) &&
          (p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase())),
      ),
    [products, query, activeCategory],
  )
  const filteredKits = useMemo(
    () => kits.filter((k) => k.name.toLowerCase().includes(query.toLowerCase())),
    [kits, query],
  )

  return (
    <div className="card card-premium glow-amber flex flex-col h-full min-h-0">
      <div className="p-4 border-b border-line space-y-3">
        <div className="flex gap-1">
          {[
            { id: 'products', label: 'Products' },
            { id: 'kits', label: 'Bundles' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                tab === t.id ? 'bg-amber text-ink shadow-[0_4px_12px_-4px_rgba(232,163,61,0.5)]' : 'text-ink-muted hover:bg-paper-dim'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={tab === 'products' ? 'Search product by name or SKU…' : 'Search bundles…'}
          />
          {tab === 'products' && (
            <span
              className="flex items-center gap-1.5 text-xs text-ink-muted shrink-0 px-2 py-1.5 rounded-lg bg-paper-dim"
              title="Plug in a USB/Bluetooth barcode scanner and scan — it'll add the product automatically"
            >
              <Icon name="barcode" className="h-4 w-4" />
              Scanner ready
            </span>
          )}
        </div>
        {tab === 'products' && categories.length > 2 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-150 ${
                  activeCategory === cat
                    ? 'bg-ink text-white'
                    : 'bg-paper-dim text-ink-muted hover:bg-line/60 hover:text-ink'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
        )}
        {scanFeedback && (
          <p className={`text-xs rounded-lg px-3 py-1.5 ${scanFeedback.ok ? 'bg-teal-light text-teal-dark' : 'bg-rose-light text-rose'}`}>
            {scanFeedback.text}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-4">
        {isLoading ? (
          <Loading message="Loading…" />
        ) : tab === 'products' ? (
          filteredProducts.length === 0 ? (
            <EmptyState title="No products match" description="Try a different search term." icon="🔍" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((product) => {
                const outOfStock = product.stock <= 0
                return (
                  <div
                    key={product.id}
                    className={`group card card-premium p-3 ${outOfStock ? '' : 'shine-sweep glow-amber'}`}
                  >
                    <button
                      type="button"
                      disabled={outOfStock}
                      onClick={() => handleProductClick(product)}
                      className="w-full text-left disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className="h-16 w-full rounded-lg bg-paper-dim border border-line flex items-center justify-center mb-2 relative overflow-hidden">
                        {product.image ? (
                          <img src={toImageUrl(product.image)} alt="" className="h-full w-full object-cover rounded-lg" />
                        ) : (
                          <Icon
                            name="products"
                            className="h-6 w-6 text-ink-muted transition-transform duration-300 group-hover:scale-110"
                          />
                        )}
                        {product.isBatchTracked && (
                          <span className="absolute top-1 right-1 badge-amber text-[10px] px-1.5 py-0.5">Batch</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-ink leading-tight line-clamp-2">{product.name}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="figure text-sm font-semibold text-ink">{formatCurrency(product.price)}</span>
                        <span className="text-xs text-ink-muted figure">{outOfStock ? 'Out' : `${product.stock} left`}</span>
                      </div>
                    </button>
                    {product.coveragePerBox && !outOfStock && (
                      <button
                        type="button"
                        onClick={() => setAreaModalProduct(product)}
                        className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs text-amber-dark font-medium py-1.5 rounded-lg border border-amber/40 transition-all duration-200 hover:bg-amber/10 hover:-translate-y-0.5"
                      >
                        <Icon name="chart" className="h-3.5 w-3.5" />
                        Area calculator
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        ) : filteredKits.length === 0 ? (
          <EmptyState title="No bundles found" description="Create one from the Kits & Bundles page." icon="🎁" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredKits.map((kit) => {
              const outOfStock = kit.availableQty <= 0
              return (
                <button
                  key={kit.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => onAddKit(kit)}
                  className={`group text-left card card-premium p-3 disabled:opacity-40 disabled:cursor-not-allowed ${
                    outOfStock ? '' : 'shine-sweep glow-amber'
                  }`}
                >
                  <div className="h-16 w-full rounded-lg bg-paper-dim border border-line flex items-center justify-center mb-2 relative">
                    <Icon
                      name="products"
                      className="h-6 w-6 text-ink-muted transition-transform duration-300 group-hover:scale-110"
                    />
                    <span className="absolute top-1 right-1 badge-amber text-[10px] px-1.5 py-0.5">Bundle</span>
                  </div>
                  <p className="text-sm font-medium text-ink leading-tight line-clamp-2">{kit.name}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{kit.components.length} components</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="figure text-sm font-semibold text-ink">{formatCurrency(kit.price)}</span>
                    <span className="text-xs text-ink-muted figure">{outOfStock ? 'Out' : `${kit.availableQty} left`}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <BatchSelectorModal
        isOpen={Boolean(batchModalProduct)}
        onClose={() => setBatchModalProduct(null)}
        product={batchModalProduct}
        initialQuantity={batchModalInitialQty}
        onSelect={(batch, quantity) => {
          onAddProduct(batchModalProduct, {
            quantity,
            batchId: batch.id,
            batchLabel: `${batch.batchNumber}${batch.shadeCode ? ` · ${batch.shadeCode}` : ''}`,
          })
          setBatchModalProduct(null)
        }}
      />

      <AreaToBoxModal
        isOpen={Boolean(areaModalProduct)}
        onClose={() => setAreaModalProduct(null)}
        product={areaModalProduct}
        onConfirm={(boxes) => {
          if (areaModalProduct.isBatchTracked) {
            // Batch-tracked product: the area calculator only computes the
            // quantity. Hand off to the batch picker with that quantity
            // pre-filled so the cart line ends up with both a quantity AND
            // a batchId — otherwise checkout will reject the line.
            setBatchModalInitialQty(boxes)
            setBatchModalProduct(areaModalProduct)
          } else {
            onAddProduct(areaModalProduct, { quantity: boxes })
          }
          setAreaModalProduct(null)
        }}
      />
    </div>
  )
}
