import { useState, useEffect, useMemo, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import Icon from '../../components/common/Icon'
import EmptyState from '../../components/common/EmptyState'
import SearchInput from '../../components/common/SearchInput'
import { formatCurrency } from '../../utils/formatters'
import { productService } from '../../services/productService'

/**
 * Generates and prints barcode labels. Admin-only (route is gated by
 * ProtectedRoute; BARCODES_MANAGE also exists as the backend-side
 * permission for this capability if it's ever exposed through an API).
 *
 * Barcode value = the product's own barcode field, which is either what
 * was scanned/typed in on the product form, or auto-generated from the
 * SKU if left blank (see products.service.js) — so it's always already
 * assigned by the time a product shows up here, nothing to "generate" on
 * this page beyond rendering it as a scannable Code128 symbol.
 *
 * Printing targets a normal office printer rather than a dedicated label
 * printer: labels are laid out in a grid on standard A4/letter paper (cut
 * apart after printing), which works on whatever printer is on hand
 * without relying on the browser honoring a custom small page size.
 */
export default function BarcodeLabelsPage() {
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState({}) // productId -> copies

  useEffect(() => {
    productService
      .getAll()
      .then((res) => setProducts(res.data.data))
      .finally(() => setIsLoading(false))
  }, [])

  const filtered = useMemo(
    () =>
      products.filter(
        (p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase()),
      ),
    [products, query],
  )

  const selectedProducts = useMemo(
    () => products.filter((p) => selected[p.id] > 0),
    [products, selected],
  )
  const totalLabels = selectedProducts.reduce((sum, p) => sum + (selected[p.id] || 0), 0)

  const [generatingFor, setGeneratingFor] = useState(null)

  async function toggle(product) {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[product.id]) {
        delete next[product.id]
      } else {
        next[product.id] = 1
      }
      return next
    })

    // Selecting a product that doesn't have a barcode yet generates and
    // saves one right away — printing is never blocked on a separate trip
    // to the product form first.
    if (!selected[product.id] && !product.barcode) {
      setGeneratingFor(product.id)
      try {
        const res = await productService.generateBarcode(product.id)
        setProducts((prev) => prev.map((p) => (p.id === product.id ? res.data.data : p)))
      } catch {
        // Leave it unset — the label preview shows "No barcode assigned"
        // and the admin can retry from the product form if this fails.
      } finally {
        setGeneratingFor(null)
      }
    }
  }

  function setCopies(productId, copies) {
    const n = Math.max(1, Math.min(100, Number(copies) || 1))
    setSelected((prev) => ({ ...prev, [productId]: n }))
  }

  // Build the flat list of individual labels to render (one entry per
  // physical sticker), so the print grid can just .map() over it.
  const labels = useMemo(() => {
    const list = []
    for (const product of selectedProducts) {
      const copies = selected[product.id] || 0
      for (let i = 0; i < copies; i += 1) {
        list.push({ key: `${product.id}-${i}`, product })
      }
    }
    return list
  }, [selectedProducts, selected])

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 flex items-start gap-3">
        <span className="hidden sm:block w-1 h-9 rounded-full bg-gradient-to-b from-amber to-amber-dark mt-0.5 shrink-0" />
        <div>
          <h1 className="page-title">Barcode Labels</h1>
          <p className="page-subtitle">Select products, choose how many copies, then print a sheet of labels.</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 min-h-0 overflow-hidden">
        {/* Product picker */}
        <div className="card card-premium flex flex-col h-full min-h-0">
          <div className="p-4 border-b border-line">
            <SearchInput value={query} onChange={setQuery} placeholder="Search product by name or SKU…" />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-4">
            {isLoading ? (
              <p className="text-sm text-ink-muted">Loading…</p>
            ) : filtered.length === 0 ? (
              <EmptyState title="No products match" description="Try a different search term." icon="🔍" />
            ) : (
              <ul className="divide-y divide-line/70">
                {filtered.map((product) => {
                  const isSelected = Boolean(selected[product.id])
                  return (
                    <li key={product.id} className="flex items-center gap-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(product)}
                        className="rounded border-line text-amber focus:ring-amber shrink-0"
                        aria-label={`Select ${product.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink truncate">{product.name}</p>
                        <p className="text-xs text-ink-muted figure">
                          {product.sku} · {formatCurrency(product.price)}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {generatingFor === product.id ? (
                            <span className="text-xs text-ink-muted">Generating barcode…</span>
                          ) : (
                            <>
                              <label className="text-xs text-ink-muted" htmlFor={`copies-${product.id}`}>
                                Copies
                              </label>
                              <input
                                id={`copies-${product.id}`}
                                type="number"
                                min="1"
                                max="100"
                                className="input-field figure !py-1 !px-2 w-16 text-center"
                                value={selected[product.id]}
                                onChange={(e) => setCopies(product.id, e.target.value)}
                              />
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Preview + print */}
        <div className="card card-premium flex flex-col h-full min-h-0">
          <div className="px-5 pt-5 pb-4 border-b border-dashed border-line shrink-0">
            <div className="flex items-center gap-2">
              <span className="section-icon rounded-lg bg-amber-light text-amber-dark">
                <Icon name="barcode" className="h-4 w-4" />
              </span>
              <h2 className="font-display text-base font-semibold text-ink">Label Sheet</h2>
            </div>
            <p className="text-sm text-ink-muted mt-1">
              {totalLabels === 0 ? 'No labels selected yet.' : `${totalLabels} label${totalLabels === 1 ? '' : 's'} ready to print.`}
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-4">
            {labels.length === 0 ? (
              <EmptyState
                title="Nothing selected"
                description="Check off products on the left to preview their labels here."
                icon="🏷️"
              />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {labels.map((label) => (
                  <BarcodeLabel key={label.key} product={label.product} />
                ))}
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-dashed border-line shrink-0">
            <button
              type="button"
              disabled={labels.length === 0}
              onClick={() => window.print()}
              className="btn-accent w-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)] disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              Print {totalLabels > 0 ? `${totalLabels} Label${totalLabels === 1 ? '' : 's'}` : 'Labels'}
            </button>
            <p className="text-xs text-ink-muted mt-2">
              Prints on standard A4/letter paper as a sheet — cut apart along the label edges.
            </p>
          </div>
        </div>
      </div>

      {/* Print-only sheet: hidden on screen, shown (and everything else
          hidden) when printing — see the .barcode-print-* rules in
          index.css. Kept as a second, unstyled-for-screen copy of the
          same labels so the on-screen preview above can use the app's
          normal card/scroll chrome while the print output stays a clean
          grid of just the labels. */}
      <div className="barcode-print-sheet">
        {labels.map((label) => (
          <BarcodeLabel key={`print-${label.key}`} product={label.product} />
        ))}
      </div>
    </div>
  )
}

/** A single label: product name, price, and a Code128 barcode rendering
 *  the product's barcode value (SKU-derived unless one was scanned in). */
function BarcodeLabel({ product }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!svgRef.current || !product.barcode) return
    try {
      JsBarcode(svgRef.current, product.barcode, {
        format: 'CODE128',
        width: 1.6,
        height: 40,
        fontSize: 11,
        margin: 4,
        displayValue: true,
      })
    } catch {
      // Barcode value has characters Code128 can't encode (rare) — leave
      // the SVG empty rather than crash the page.
    }
  }, [product.barcode])

  return (
    <div className="barcode-label border border-line rounded-lg p-2 bg-white flex flex-col items-center text-center">
      <p className="text-[11px] font-medium text-ink leading-tight truncate w-full">{product.name}</p>
      <p className="text-[10px] text-ink-muted figure">{formatCurrency(product.price)}</p>
      {product.barcode ? (
        <svg ref={svgRef} className="w-full" />
      ) : (
        <p className="text-[10px] text-ink-muted italic py-2">No barcode assigned</p>
      )}
    </div>
  )
}