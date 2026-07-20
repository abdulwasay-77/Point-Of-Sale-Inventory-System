
/**
 * EmptyState — shown when a list/table has no data yet.
 * Treats emptiness as an invitation to act, per the interface's own voice:
 * explains what's missing and offers the primary action to fix it.
 */
export default function EmptyState({
  title = 'Nothing here yet',
  description = 'Once you add data, it will show up here.',
  actionLabel,
  onAction,
  icon = '📄',
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="text-4xl mb-3" aria-hidden="true">
        {icon}
      </div>
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      <p className="text-sm text-ink-muted mt-1 max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="btn-accent mt-5">
          {actionLabel}
        </button>
      )}
    </div>
  )
}
