
/**
 * Consistent page header: title + subtitle on the left, primary action
 * (e.g. "Add Product") on the right. Used at the top of every module page.
 *
 * Premium touch: a slim gradient accent bar sits to the left of the
 * title, tying every page header back to the amber "register key"
 * accent color without being loud about it.
 */
export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div className="flex items-start gap-3">
        <span className="hidden sm:block w-1 h-9 rounded-full bg-gradient-to-b from-amber to-amber-dark mt-0.5 shrink-0" />
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
