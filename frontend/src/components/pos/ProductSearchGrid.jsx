import { useState, useMemo, useEffect, useCallback } from 'react'
import SearchInput from '../common/SearchInput'
import EmptyState from '../common/EmptyState'
import Loading from '../common/Loading'
import Icon from '../common/Icon'
import { formatCurrency } from '../../utils/formatters'
import { productService } from '../../services/productService'
import { kitService } from '../../services/kitService'
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner'
import VariantBatchSelectorModal from './VariantBatchSelectorModal'
import AreaCoverageCalculatorModal from './AreaCoverageCalculatorModal'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api$/, '')
function toImageUrl(path) {
  if (!path) return null
  return path.startsWith('http') ? path : `${API_ORIGIN}${path}`
}

// Persisted the same way the sidebar remembers its collapsed state (see
// DashboardLayout.jsx's SIDEBAR_COLLAPSE_KEY) — so an admin's preferred
// layout survives a refresh instead of resetting to Card every time.
const VIEW_MODE_KEY = 'pos_product_view_mode'
const VIEW_MODES = [
  { id: 'card', label: 'Card view', icon: 'viewCard' },
  { id: 'grid', label: 'Grid view', icon: 'viewGrid' },
  { id: 'list', label: 'List view', icon: 'viewList' },
]

/**
 * Left-hand panel of the POS screen. Two tabs:
 *  - Products: search/scan a product and add it to the cart. Batch-tracked
 *    products (FR: Batch & Lot Tracking) open a batch picker instead of
 *    adding directly; products with an area-coverage rule set (FR: Area
 *    Coverage Calculator) get a calculator shortcut alongside the regular
 *    add.
 *  - Kits: sell a bundle (FR: Kitting & Bundling) as one line.
 *
 * A product can be BOTH batch-tracked AND have an area-coverage
 * calculator (e.g. ceramic tiles sold by the carton, where each shipment/
 * lot can have a slightly different shade). In that case the two flows
 * are chained: the area calculator only computes a quantity, it never
 * adds to the cart by itself — for a batch-tracked product it hands off
 * to the batch picker with that quantity pre-filled, so the cart line
 * always ends up with both a quantity AND a batchId. Without a batchId,
 * checkout is rejected by the backend for batch-tracked products, so this
 * hand-off is required, not just a nicety.
 *
 * Also listens for a physical barcode scanner (see useBarcodeScanner) —
 * works with any USB/Bluetooth HID scanner automatically, nothing to
 * configure.
 *
 * View modes: Card / Grid / List, switchable via the small segmented
 * control next to the Products/Bundles tabs and persisted to
 * localStorage (VIEW_MODE_KEY) so it survives a page refresh.
 *  - Card: the original, roomiest tile — bigger thumbnail, full-width
 *    "Area calculator" button. Best when browsing visually.
 *  - Grid: the same tile shape but denser (more columns, smaller
 *    thumbnail, icon-only area-calculator button) — more items on
 *    screen at once without leaving the tile layout.
 *  - List: a compact single-column row per item (small thumbnail, name +
 *    SKU/category, price and stock at a glance) — fastest to scan and
 *    click through for a busy checkout queue.
 * The active view applies to whichever of Products/Bundles is open.
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
export default function ProductSearchGrid({ onAddProduct, onAddKit, customerId }) {
  const [tab, setTab] = useState('products')
  const [viewMode, setViewMode] = useState(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY)
    return VIEW_MODES.some((v) => v.id === stored) ? stored : 'card'
  })
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [products, setProducts] = useState([])
  const [kits, setKits] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [scanFeedback, setScanFeedback] = useState(null)
  const [pickerProduct, setPickerProduct] = useState(null)
  const [pickerInitialQty, setPickerInitialQty] = useState(1)
  const [areaModalProduct, setAreaModalProduct] = useState(null)

  const needsPicker = (product) => product.isBatchTracked || product.isVariantTracked

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    Promise.all([productService.getAll(), kitService.getAll()])
      .then(([productsRes, kitsRes]) => {
        setProducts(productsRes.data.data)
        setKits(kitsRes.data.data)
      })
      .finally(() => setIsLoading(false))
  }, [])

  function handleProductClick(product) {
    if (needsPicker(product)) {
      setPickerInitialQty(1)
      setPickerProduct(product)
    } else {
      onAddProduct(product)
    }
  }

  const handleScan = useCallback(
    async (code) => {
      try {
        const res = await productService.lookupByCode(code)
        const product = res.data.data
        if (needsPicker(product)) {
          setPickerInitialQty(1)
          setPickerProduct(product)
          setScanFeedback({ ok: true, text: `"${product.name}" scanned — pick an option` })
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

  const isGrid = viewMode === 'grid'
  const isList = viewMode === 'list'
  const tileGridClass = isGrid
    ? 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2'
    : 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3'

  function renderProductTile(product) {
    const outOfStock = product.stock <= 0
    return (
      <div
        key={product.id}
        className={`group card card-premium ${isGrid ? 'p-2' : 'p-3'} ${outOfStock ? '' : 'shine-sweep glow-amber'}`}
      >
        <button
          type="button"
          disabled={outOfStock}
          onClick={() => handleProductClick(product)}
          className="w-full text-left disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div
            className={`${isGrid ? 'h-11' : 'h-16'} w-full rounded-lg bg-paper-dim dark:bg-dark-card2 border border-line dark:border-dark-border flex items-center justify-center mb-2 relative overflow-hidden`}
          >
            {product.image ? (
              <img src={toImageUrl(product.image)} alt="" className="h-full w-full object-cover rounded-lg" />
            ) : (
              <Icon
                name="products"
                className={`${isGrid ? 'h-4 w-4' : 'h-6 w-6'} text-ink-muted dark:text-dark-muted transition-transform duration-300 group-hover:scale-110`}
              />
            )}
            {(product.isBatchTracked || product.isVariantTracked) && (
              <span className="absolute top-1 right-1 flex flex-col items-end gap-0.5">
                {product.isVariantTracked && !isGrid && (
                  <span className="badge-amber text-[10px] px-1.5 py-0.5">{(product.variationNames || []).join(' + ') || 'Variant'}</span>
                )}
                {product.isBatchTracked && !isGrid && <span className="badge-amber text-[10px] px-1.5 py-0.5">Batch</span>}
                {isGrid && <span className="h-2 w-2 rounded-full bg-amber ring-2 ring-white dark:ring-dark-card" />}
              </span>
            )}
          </div>
          <p
            className={`${isGrid ? 'text-xs' : 'text-sm'} font-medium text-ink dark:text-dark-text leading-tight line-clamp-2`}
          >
            {product.name}
          </p>
          <div className="flex items-center justify-between mt-1.5">
            <span className={`figure ${isGrid ? 'text-xs' : 'text-sm'} font-semibold text-ink dark:text-dark-text`}>
              {formatCurrency(product.price)}
            </span>
            <span className="text-xs text-ink-muted dark:text-dark-muted figure">
              {outOfStock ? 'Out' : `${product.stock} left`}
            </span>
          </div>
        </button>
        {product.coverageQuantity && product.coverageUomId && !outOfStock && (
          <button
            type="button"
            onClick={() => setAreaModalProduct(product)}
            title="Area calculator"
            className={`w-full mt-2 flex items-center justify-center gap-1.5 text-xs text-amber-dark dark:text-amber font-medium rounded-lg border border-amber/40 transition-all duration-200 hover:bg-amber/10 hover:-translate-y-0.5 ${
              isGrid ? 'py-1' : 'py-1.5'
            }`}
          >
            <Icon name="chart" className="h-3.5 w-3.5" />
            {!isGrid && 'Area calculator'}
          </button>
        )}
      </div>
    )
  }

  function renderProductRow(product) {
    const outOfStock = product.stock <= 0
    return (
      <div
        key={product.id}
        className={`group flex items-center gap-3 px-2.5 py-2 rounded-lg border border-transparent transition-colors duration-150 ${
          outOfStock ? '' : 'hover:bg-paper-dim dark:hover:bg-dark-card2 hover:border-line dark:hover:border-dark-border'
        }`}
      >
        <button
          type="button"
          disabled={outOfStock}
          onClick={() => handleProductClick(product)}
          className="flex-1 min-w-0 flex items-center gap-3 text-left disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className="h-10 w-10 shrink-0 rounded-lg bg-paper-dim dark:bg-dark-card2 border border-line dark:border-dark-border flex items-center justify-center overflow-hidden">
            {product.image ? (
              <img src={toImageUrl(product.image)} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon name="products" className="h-4 w-4 text-ink-muted dark:text-dark-muted" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{product.name}</p>
              {product.isVariantTracked && (
                <span className="badge-amber text-[10px] px-1.5 py-0.5 shrink-0">{(product.variationNames || []).join(' + ') || 'Variant'}</span>
              )}
              {product.isBatchTracked && <span className="badge-amber text-[10px] px-1.5 py-0.5 shrink-0">Batch</span>}
            </div>
            <p className="text-xs text-ink-muted dark:text-dark-muted truncate figure">
              {product.sku}
              {product.category ? ` · ${product.category}` : ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="figure text-sm font-semibold text-ink dark:text-dark-text">{formatCurrency(product.price)}</p>
            <p className="text-xs text-ink-muted dark:text-dark-muted figure">{outOfStock ? 'Out of stock' : `${product.stock} left`}</p>
          </div>
        </button>
        {product.coverageQuantity && product.coverageUomId && !outOfStock && (
          <button
            type="button"
            onClick={() => setAreaModalProduct(product)}
            title="Area calculator"
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border border-amber/40 text-amber-dark dark:text-amber transition-all duration-200 hover:bg-amber/10"
          >
            <Icon name="chart" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    )
  }

  function renderKitTile(kit) {
    const outOfStock = kit.availableQty <= 0
    return (
      <button
        key={kit.id}
        type="button"
        disabled={outOfStock}
        onClick={() => onAddKit(kit)}
        className={`group text-left card card-premium ${isGrid ? 'p-2' : 'p-3'} disabled:opacity-40 disabled:cursor-not-allowed ${
          outOfStock ? '' : 'shine-sweep glow-amber'
        }`}
      >
        <div
          className={`${isGrid ? 'h-11' : 'h-16'} w-full rounded-lg bg-paper-dim dark:bg-dark-card2 border border-line dark:border-dark-border flex items-center justify-center mb-2 relative`}
        >
          <Icon
            name="products"
            className={`${isGrid ? 'h-4 w-4' : 'h-6 w-6'} text-ink-muted dark:text-dark-muted transition-transform duration-300 group-hover:scale-110`}
          />
          {!isGrid && <span className="absolute top-1 right-1 badge-amber text-[10px] px-1.5 py-0.5">Bundle</span>}
        </div>
        <p className={`${isGrid ? 'text-xs' : 'text-sm'} font-medium text-ink dark:text-dark-text leading-tight line-clamp-2`}>
          {kit.name}
        </p>
        {!isGrid && <p className="text-xs text-ink-muted dark:text-dark-muted mt-0.5">{kit.components.length} components</p>}
        <div className="flex items-center justify-between mt-1.5">
          <span className={`figure ${isGrid ? 'text-xs' : 'text-sm'} font-semibold text-ink dark:text-dark-text`}>
            {formatCurrency(kit.price)}
          </span>
          <span className="text-xs text-ink-muted dark:text-dark-muted figure">{outOfStock ? 'Out' : `${kit.availableQty} left`}</span>
        </div>
      </button>
    )
  }

  function renderKitRow(kit) {
    const outOfStock = kit.availableQty <= 0
    return (
      <button
        key={kit.id}
        type="button"
        disabled={outOfStock}
        onClick={() => onAddKit(kit)}
        className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg border border-transparent text-left transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
          outOfStock ? '' : 'hover:bg-paper-dim dark:hover:bg-dark-card2 hover:border-line dark:hover:border-dark-border'
        }`}
      >
        <div className="h-10 w-10 shrink-0 rounded-lg bg-paper-dim dark:bg-dark-card2 border border-line dark:border-dark-border flex items-center justify-center relative">
          <Icon name="products" className="h-4 w-4 text-ink-muted dark:text-dark-muted" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{kit.name}</p>
            <span className="badge-amber text-[10px] px-1.5 py-0.5 shrink-0">Bundle</span>
          </div>
          <p className="text-xs text-ink-muted dark:text-dark-muted truncate">{kit.components.length} components</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="figure text-sm font-semibold text-ink dark:text-dark-text">{formatCurrency(kit.price)}</p>
          <p className="text-xs text-ink-muted dark:text-dark-muted figure">{outOfStock ? 'Out of stock' : `${kit.availableQty} left`}</p>
        </div>
      </button>
    )
  }

  return (
    <div className="card card-premium glow-amber flex flex-col h-full min-h-0">
      <div className="p-4 border-b border-line dark:border-dark-border space-y-3">
        <div className="flex items-center justify-between gap-2">
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
                  tab === t.id ? 'bg-amber text-ink dark:text-dark-text shadow-[0_4px_12px_-4px_rgba(232,163,61,0.5)]' : 'text-ink-muted dark:text-dark-muted hover:bg-paper-dim dark:hover:bg-dark-card2'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-lg bg-paper-dim dark:bg-dark-card2 p-0.5 shrink-0" role="group" aria-label="Change layout">
            {VIEW_MODES.map((v) => (
              <button
                key={v.id}
                type="button"
                title={v.label}
                aria-label={v.label}
                aria-pressed={viewMode === v.id}
                onClick={() => setViewMode(v.id)}
                className={`flex items-center justify-center h-7 w-7 rounded-md transition-all duration-200 ${
                  viewMode === v.id
                    ? 'bg-white dark:bg-dark-card text-ink dark:text-dark-text shadow-sm'
                    : 'text-ink-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-text'
                }`}
              >
                <Icon name={v.icon} className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={tab === 'products' ? 'Search product by name or SKU…' : 'Search bundles…'}
          />
          {tab === 'products' && (
            <span
              className="flex items-center gap-1.5 text-xs text-ink-muted dark:text-dark-muted shrink-0 px-2 py-1.5 rounded-lg bg-paper-dim dark:bg-dark-card2"
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
                    ? 'bg-ink text-white dark:bg-dark-border dark:text-dark-text'
                    : 'bg-paper-dim dark:bg-dark-card2 text-ink-muted dark:text-dark-muted hover:bg-line/60 dark:hover:bg-dark-border/60 hover:text-ink dark:hover:text-dark-text'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
        )}
        {scanFeedback && (
          <p className={`text-xs rounded-lg px-3 py-1.5 ${scanFeedback.ok ? 'bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal' : 'bg-rose-light dark:bg-dark-rose/15 text-rose dark:text-dark-rose'}`}>
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
          ) : isList ? (
            <div className="space-y-1">{filteredProducts.map((product) => renderProductRow(product))}</div>
          ) : (
            <div className={tileGridClass}>{filteredProducts.map((product) => renderProductTile(product))}</div>
          )
        ) : filteredKits.length === 0 ? (
          <EmptyState title="No bundles found" description="Create one from the Kits & Bundles page." icon="🎁" />
        ) : isList ? (
          <div className="space-y-1">{filteredKits.map((kit) => renderKitRow(kit))}</div>
        ) : (
          <div className={tileGridClass}>{filteredKits.map((kit) => renderKitTile(kit))}</div>
        )}
      </div>

      <VariantBatchSelectorModal
        isOpen={Boolean(pickerProduct)}
        onClose={() => setPickerProduct(null)}
        product={pickerProduct}
        initialQuantity={pickerInitialQty}
        customerId={customerId}
        onSelect={({ variant, batch }, quantity) => {
          onAddProduct(pickerProduct, {
            quantity,
            variantId: variant?.id || null,
            variantLabel: variant?.name || null,
            variantPriceAdjustment: variant?.priceAdjustment || 0,
            variantStock: variant?.stock ?? null,
            batchId: batch?.id || null,
            batchLabel: batch ? batch.batchNumber : null,
          })
          setPickerProduct(null)
        }}
      />

      <AreaCoverageCalculatorModal
        isOpen={Boolean(areaModalProduct)}
        onClose={() => setAreaModalProduct(null)}
        product={areaModalProduct}
        onConfirm={(quantity) => {
          if (areaModalProduct && needsPicker(areaModalProduct)) {
            // Batch- and/or variant-tracked product: the area calculator
            // only computes the quantity. Hand off to the picker with that
            // quantity pre-filled so the cart line ends up with a
            // quantity AND whichever of batchId/variantId this product
            // requires — otherwise checkout will reject the line.
            setPickerInitialQty(quantity)
            setPickerProduct(areaModalProduct)
          } else {
            onAddProduct(areaModalProduct, { quantity })
          }
          setAreaModalProduct(null)
        }}
      />
    </div>
  )
}