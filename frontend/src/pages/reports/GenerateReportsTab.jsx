import { Link } from 'react-router-dom'
import Icon from '../../components/common/Icon'
import { REPORT_SECTIONS, REPORT_DEFINITIONS } from './reportDefinitions'

// Same tone→gradient mapping as StatCard.jsx, kept literal (not built
// from a template string) so Tailwind's class scanner can see every
// variant this file actually uses.
const TONE_ICON_CLASS = {
  amber: 'bg-gradient-to-br from-amber to-amber-dark text-ink dark:text-dark-text',
  teal: 'bg-gradient-to-br from-teal to-teal-dark text-white',
  rose: 'bg-gradient-to-br from-rose to-[#9c3f22] text-white',
}
const TONE_GLOW_CLASS = { amber: 'glow-amber', teal: 'glow-teal', rose: 'glow-rose' }

/**
 * Generate Reports tab — one card per report, grouped into the three
 * sections from the sketch (Sales / Inventory / Customers). Every card
 * is just a link to /reports/generate/:reportKey — ReportDetailPage.jsx
 * is the one generic page that renders every report's filters, table,
 * and Generate PDF button, driven entirely by reportDefinitions.js.
 */
export default function GenerateReportsTab() {
  return (
    <div className="space-y-8">
      {REPORT_SECTIONS.map((section) => (
        <div key={section.key}>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-muted dark:text-dark-muted mb-3">
            {section.label}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {section.reportKeys.map((reportKey) => {
              const def = REPORT_DEFINITIONS[reportKey]
              if (!def) return null
              return (
                <Link
                  key={reportKey}
                  to={`/reports/generate/${reportKey}`}
                  className={`group relative card card-premium shine-sweep ${TONE_GLOW_CLASS[section.tone]} p-4 sm:p-5 flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5`}
                >
                  <span
                    className={`icon-pop h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${TONE_ICON_CLASS[section.tone]}`}
                  >
                    <Icon name={def.icon} className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-display text-sm font-semibold text-ink dark:text-dark-text">{def.label}</p>
                    <p className="text-xs text-ink-muted dark:text-dark-muted mt-1">{def.description}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}