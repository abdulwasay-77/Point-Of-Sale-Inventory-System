
/**
 * Simple pagination control used across list pages (products, customers, sales…).
 */
export default function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-line">
      <p className="text-xs text-ink-muted">
        Page <span className="figure">{currentPage}</span> of{' '}
        <span className="figure">{totalPages}</span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-outline px-3 py-1.5"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn-outline px-3 py-1.5"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}
