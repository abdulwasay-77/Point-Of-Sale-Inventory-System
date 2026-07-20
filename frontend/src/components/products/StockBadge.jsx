
import Badge from '../common/Badge'
import { LOW_STOCK_THRESHOLD } from '../../utils/constants'

/**
 * Shows an in-stock or low-stock badge based on the shared threshold.
 * Low-stock gets a small pulsing dot ahead of it — the same urgency
 * cue used on the dashboard's low-stock list — so it stays consistent
 * wherever stock levels are surfaced across the app.
 */
export default function StockBadge({ stock }) {
  if (stock <= LOW_STOCK_THRESHOLD) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-rose pulse-dot" aria-hidden="true" />
        <Badge tone="rose">Low stock · {stock}</Badge>
      </span>
    )
  }
  return <Badge tone="teal">In stock · {stock}</Badge>
}
