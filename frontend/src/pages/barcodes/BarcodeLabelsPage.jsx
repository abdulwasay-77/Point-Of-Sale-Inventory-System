import { useState, useEffect, useMemo, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import Icon from '../../components/common/Icon'
import EmptyState from '../../components/common/EmptyState'
import SearchInput from '../../components/common/SearchInput'
import PageHeader from '../../components/common/PageHeader'
import StatCard from '../../components/dashboard/StatCard'
import { formatCurrency } from '../../utils/formatters'
import { productService } from '../../services/productService'

// Shared utility classes for the two internally-scrolling card bodies:
// scrolls with the wheel/trackpad/keyboard like normal, but the
// scrollbar track itself is hidden across engines (Firefox via
// scrollbar-width, old Edge/IE via -ms-overflow-style, Chrome/Safari via
// the ::-webkit-scrollbar pseudo-element).
const SCROLL_AREA =
  'flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

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
 *
 * Premium pass: brought up to parity with Dashboard/Categories/Inventory —
 * the same soft ambient blobs behind the page (`.dashboard-ambient`), a
 * Dashboard-style stat row (reusing the exact `StatCard` component)
 * summarizing the catalog's barcode coverage at a glance, the shared
 * `PageHeader` instead of a one-off header block, `card-premium` +
 * `shine-sweep` + `glow-*` on both panels, and products missing a barcode
 * now carry the same persistent tinted-row + pulsing flag treatment
 * Categories uses for empty categories and Inventory uses for low stock —
 * so a gap in barcode coverage is visible while scanning the list, not
 * just after selecting something.
 *
 * Layout pass: on desktop (`lg` and up) the page is pinned to its
 * available height with no page-level scroll — header and stat row are
 * fixed-height chrome (`shrink-0`), the two-panel row fills the rest
 * (`flex-1 min-h-0`), and each panel scrolls internally instead
 * (`SCROLL_AREA` below) — so a long product list or a big label sheet
 * scrolls inside its own card instead of pushing the page down. Below
 * `lg`, where the two panels stack vertically instead of sitting side by
 * side, that same rigid pinning doesn't reliably leave enough room for
 * both — so there the page drops the fixed height/overflow-hidden
 * entirely and just flows normally, scrolling as a whole page (via
 * DashboardLayout's <main>) the same way every other page in the app
 * does. The hover-lift override (`hover:!translate-y-0`) still keeps
 * both cards from creeping up under the sticky top navbar while their
 * contents scroll.
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

  const stats = useMemo(() => {
    const total = products.length
    const missingBarcode = products.filter((p) => !p.barcode).length
    return { total, missingBarcode, selected: selectedProducts.length, totalLabels }
  }, [products, selectedProducts, totalLabels])

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
    <div data-keyboard-scope className="dashboard-ambient overflow-x-hidden flex flex-col lg:h-full lg:overflow-y-hidden">
      <div className="shrink-0">
        <PageHeader title="Barcode Labels" subtitle="Select products, choose how many copies, then print a sheet of labels." />
      </div>

      {!isLoading && (
        <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
          <StatCard label="Total Products" value={stats.total} icon="products" tone="ink" />
          <StatCard label="Missing Barcode" value={stats.missingBarcode} icon="barcode" tone="rose" />
          <StatCard label="Selected" value={stats.selected} icon="categories" tone="teal" />
          <StatCard label="Labels Queued" value={stats.totalLabels} icon="pos" tone="amber" highlight={stats.totalLabels > 0} />
        </div>
      )}

      {/* Below `lg` this is a plain vertical stack that grows with its
          content — no forced height, no clipping — so the page itself
          scrolls (via DashboardLayout's <main>) the same way any other
          page does. At `lg` and up it switches to the pinned two-column
          grid, where each panel scrolls internally instead (see
          SCROLL_AREA) so neither panel's own scrolling fights the
          other's on a wide desktop screen. */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_460px] gap-4 mt-1 lg:overflow-hidden">
        {/* Product picker */}
        <div className="card card-premium shine-sweep glow-teal flex flex-col min-w-0 overflow-hidden lg:h-full hover:!translate-y-0">
          <div className="px-5 pt-5 pb-4 border-b border-line dark:border-dark-border shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="section-icon bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal">
                <Icon name="products" className="h-4 w-4" />
              </span>
              <h2 className="font-display text-base font-semibold text-ink dark:text-dark-text">Select Products</h2>
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Search product by name or SKU…" />
          </div>
          <div className={`p-4 ${SCROLL_AREA}`}>
            {isLoading ? (
              <p className="text-sm text-ink-muted dark:text-dark-muted">Loading…</p>
            ) : filtered.length === 0 ? (
              <EmptyState title="No products match" description="Try a different search term." icon="🔍" />
            ) : (
              <ul className="divide-y divide-line/70 dark:divide-dark-border/70">
                {filtered.map((product) => {
                  const isSelected = Boolean(selected[product.id])
                  const missingBarcode = !product.barcode
                  return (
                    <li
                      key={product.id}
                      className={`group flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg transition-colors duration-200 hover:bg-paper-dim/60 dark:hover:bg-dark-card2/60 ${
                        missingBarcode ? 'bg-rose-light/20 dark:bg-dark-rose/15' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(product)}
                        className="rounded border-line dark:border-dark-border text-amber focus:ring-amber shrink-0"
                        aria-label={`Select ${product.name}`}
                      />
                      <span
                        className={`section-icon rounded-lg border shrink-0 ${
                          missingBarcode
                            ? 'bg-rose-light dark:bg-dark-rose/15 border-rose/20 dark:border-dark-rose/20 text-rose dark:text-dark-rose'
                            : 'bg-teal-light dark:bg-dark-teal/15 border-teal/20 dark:border-dark-teal/20 text-teal-dark dark:text-dark-teal'
                        }`}
                      >
                        <Icon name="barcode" className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink dark:text-dark-text truncate transition-colors duration-200 group-hover:text-teal-dark dark:group-hover:text-dark-teal">
                          {product.name}
                        </p>
                        <p className="text-xs text-ink-muted dark:text-dark-muted figure flex items-center gap-1.5">
                          {product.sku} · {formatCurrency(product.price)}
                          {missingBarcode && (
                            <span className="inline-flex items-center gap-1 ml-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose dark:bg-dark-rose pulse-dot" aria-hidden="true" />
                              <span className="text-[10px] font-semibold text-rose dark:text-dark-rose uppercase tracking-wide">
                                No barcode
                              </span>
                            </span>
                          )}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {generatingFor === product.id ? (
                            <span className="text-xs text-ink-muted dark:text-dark-muted">Generating barcode…</span>
                          ) : (
                            <>
                              <label className="text-xs text-ink-muted dark:text-dark-muted" htmlFor={`copies-${product.id}`}>
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
        <div className="card card-premium shine-sweep glow-amber flex flex-col min-w-0 overflow-hidden lg:h-full hover:!translate-y-0">
          <div className="px-5 pt-5 pb-4 border-b border-dashed border-line dark:border-dark-border shrink-0">
            <div className="flex items-center gap-2">
              <span className="section-icon bg-amber-light dark:bg-amber/15 text-amber-dark dark:text-amber">
                <Icon name="barcode" className="h-4 w-4" />
              </span>
              <h2 className="font-display text-base font-semibold text-ink dark:text-dark-text">Label Sheet</h2>
            </div>
            <p className="text-sm text-ink-muted dark:text-dark-muted mt-1">
              {totalLabels === 0 ? 'No labels selected yet.' : `${totalLabels} label${totalLabels === 1 ? '' : 's'} ready to print.`}
            </p>
          </div>

          <div className={`p-4 ${SCROLL_AREA}`}>
            {labels.length === 0 ? (
              <EmptyState
                title="Nothing selected"
                description="Check off products on the left to preview their labels here."
                icon="🏷️"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2 min-w-0 content-start">
                {labels.map((label) => (
                  <BarcodeLabel key={label.key} product={label.product} />
                ))}
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-dashed border-line dark:border-dark-border shrink-0">
            <button
              type="button"
              disabled={labels.length === 0}
              onClick={() => window.print()}
              className="btn-accent w-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)] disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              Print {totalLabels > 0 ? `${totalLabels} Label${totalLabels === 1 ? '' : 's'}` : 'Labels'}
            </button>
            <p className="text-xs text-ink-muted dark:text-dark-muted mt-2">
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
 *  the product's barcode value (SKU-derived unless one was scanned in).
 *  On-screen tiles get a subtle premium lift + amber border-glow on
 *  hover, matching the rest of the app's card language; the print-sheet
 *  copy is unaffected since these styles don't apply under @media print. */
function BarcodeLabel({ product }) {
  const svgRef = useRef(null)
  const tileRef = useRef(null)

  // Forces the tile to hug its content no matter what — if `.barcode-label`
  // in index.css has a fixed/`!important` height left over from an earlier
  // design pass, no amount of Tailwind classes on this element can beat
  // it (an external `!important` rule always wins over a plain class,
  // and even over an `!important` *class* if that class was defined
  // before the external rule in the stylesheet). Setting the property
  // via the CSSOM with `important` here is the one thing guaranteed to
  // win over any external rule, since it's evaluated as the highest-
  // specificity author-important declaration there is.
  useEffect(() => {
    const el = tileRef.current
    if (!el) return
    el.style.setProperty('height', 'auto', 'important')
    el.style.setProperty('min-height', '0', 'important')
    el.style.setProperty('max-height', 'none', 'important')
  })

  useEffect(() => {
    if (!svgRef.current || !product.barcode) return
    try {
      JsBarcode(svgRef.current, product.barcode, {
        format: 'CODE128',
        width: 1.3,
        height: 34,
        fontSize: 10,
        margin: 3,
        displayValue: true,
      })
      // Read the barcode's true rendered size directly from its own
      // geometry (getBBox) rather than trusting the width/height
      // attributes JsBarcode happens to set — those can be missing or
      // stale depending on the renderer path, and when that read
      // silently failed, the resize below never ran at all, so the
      // barcode kept its large native size and the tile around it grew
      // to match. getBBox is the actual rendered extent, so it can't
      // fail the same way.
      const svg = svgRef.current
      try {
        const box = svg.getBBox()
        if (box.width && box.height) {
          const pad = 2
          svg.setAttribute(
            'viewBox',
            `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`,
          )
        }
      } catch {
        // getBBox can throw if the SVG isn't in a rendered/visible
        // context yet — fall through and just let it size natively.
      }
      svg.removeAttribute('width')
      svg.removeAttribute('height')
      svg.style.width = '130px'
      svg.style.maxWidth = '100%'
      svg.style.height = 'auto'
      svg.style.display = 'block'
    } catch {
      // Barcode value has characters Code128 can't encode (rare) — leave
      // the SVG empty rather than crash the page.
    }
  }, [product.barcode])

  return (
    <div ref={tileRef} className="barcode-label !h-auto !min-h-0 !max-h-none border border-line dark:border-dark-border rounded-lg p-2 bg-white dark:bg-dark-card flex flex-col items-center justify-center gap-0.5 text-center w-full min-w-0 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-amber/40 hover:shadow-[0_8px_18px_-8px_rgba(232,163,61,0.4)]">
      <p className="text-sm font-medium text-ink dark:text-dark-text leading-tight truncate w-full">{product.name}</p>
      <p className="text-xs text-ink-muted dark:text-dark-muted figure leading-tight">{formatCurrency(product.price)}</p>
      {product.barcode ? (
        <svg ref={svgRef} className="mx-auto block" />
      ) : (
        <p className="text-xs text-ink-muted dark:text-dark-muted italic py-1">No barcode assigned</p>
      )}
    </div>
  )
}
