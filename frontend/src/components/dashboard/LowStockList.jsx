
import Badge from '../common/Badge'
import EmptyState from '../common/EmptyState'

/**
 * Shows products at or below the low-stock threshold on the dashboard.
 *
 * Premium treatment: each row gets a soft tinted wash + left accent bar
 * on hover (no layout shift, since it's an inset box-shadow rather than
 * a transform), a rose "pulse" dot ahead of the badge to draw the eye,
 * and a subtle icon avatar so the list doesn't read as bare text rows.
 */
export default function LowStockList({ products }) {
  if (!products.length) {
    return (
      <EmptyState
        icon="✅"
        title="Stock levels look healthy"
        description="No products are currently below the low-stock threshold."
      />
    )
  }

  return (
    <ul className="divide-y divide-line">
      {products.map((product) => (
        <li
          key={product.id}
          className="group flex items-center justify-between gap-3 py-3 px-3 -mx-2 rounded-lg transition-all duration-200 hover:bg-gradient-to-r hover:from-rose-light/70 hover:to-transparent hover:shadow-[inset_3px_0_0_0_#C1502E]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-light text-rose ring-1 ring-rose/20 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
              <span className="text-sm font-semibold figure">{product.stock}</span>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink truncate">{product.name}</p>
              <p className="text-xs text-ink-muted figure">{product.sku}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-rose pulse-dot" aria-hidden="true" />
            <Badge tone="rose">{product.stock} left</Badge>
          </div>
        </li>
      ))}
    </ul>
  )
}
