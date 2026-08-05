import { Link } from 'react-router-dom'
import Icon from '../common/Icon'
import Badge from '../common/Badge'
import EmptyState from '../common/EmptyState'
import { formatCurrency, formatDateTime } from '../../utils/formatters'

const METHOD_LABELS = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Transfer',
  UPI: 'UPI',
  CREDIT: 'Credit',
}
const METHOD_TONES = {
  CASH: 'teal',
  CARD: 'amber',
  BANK_TRANSFER: 'amber',
  UPI: 'teal',
  CREDIT: 'rose',
}

/**
 * Latest transactions, newest first — same row treatment as LowStockList
 * (tinted hover wash + left accent bar) so the two panels read as one
 * family even though one warns and the other informs.
 */
export default function RecentSalesCard({ sales }) {
  return (
    <div className="card card-premium shine-sweep glow-teal p-4 sm:p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal flex items-center justify-center">
            <Icon name="sales" className="h-4 w-4" />
          </span>
          <h2 className="font-display text-base font-semibold text-ink dark:text-dark-text">Recent sales</h2>
        </div>
        <Link
          to="/sales"
          className="text-sm text-amber-dark dark:text-amber font-medium hover:underline underline-offset-2"
        >
          View all →
        </Link>
      </div>

      {!sales.length ? (
        <EmptyState icon="🧾" title="No sales yet" description="Completed sales will show up here as they come in." />
      ) : (
        <ul className="divide-y divide-line dark:divide-dark-border -mx-1 max-h-80 overflow-y-auto">
          {sales.map((sale) => (
            <li
              key={sale.id}
              className="group flex items-center justify-between gap-3 py-3 px-3 rounded-lg transition-all duration-200 hover:bg-gradient-to-r hover:from-teal-light/70 hover:to-transparent hover:shadow-[inset_3px_0_0_0_#2F6F6B] dark:hover:from-dark-teal/15 dark:hover:shadow-[inset_3px_0_0_0_#4FB8AD]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-light dark:bg-dark-teal/15 text-teal-dark dark:text-dark-teal ring-1 ring-teal/20 dark:ring-dark-teal/20 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                  <Icon name="pos" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink dark:text-dark-text truncate">{sale.customer}</p>
                  <p className="text-xs text-ink-muted dark:text-dark-muted figure">
                    {sale.invoiceNumber} · {formatDateTime(sale.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="figure text-sm font-semibold text-ink dark:text-dark-text">
                  {formatCurrency(sale.total)}
                </span>
                <Badge tone={METHOD_TONES[sale.method] || 'amber'}>{METHOD_LABELS[sale.method] || sale.method}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}