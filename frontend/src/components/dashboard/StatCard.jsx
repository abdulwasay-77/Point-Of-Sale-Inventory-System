
import Icon from '../common/Icon'

/**
 * Dashboard stat tile. Uses the receipt-panel signature surface with a
 * mono figure for the headline number, echoing a printed ledger total.
 *
 * Premium treatment layered on top of the existing tone system:
 *  - `.card-premium` lift + resting shadow
 *  - `.shine-sweep` diagonal light pass on hover
 *  - `.glow-{tone}` colored border + halo on hover, matching the card's tone
 *  - the icon square "pops" (scale + rotate) on hover via `.icon-pop` + `group`
 *
 * Set `highlight` for a persistent, gentle amber glow (the .stat-card-glow
 * keyframe in index.css) — used sparingly, not on every card.
 */
export default function StatCard({ label, value, icon, tone = 'ink', suffix, highlight = false }) {
  const iconToneClass = {
    ink: 'bg-ink text-paper',
    amber: 'bg-gradient-to-br from-amber to-amber-dark text-ink',
    teal: 'bg-gradient-to-br from-teal to-teal-dark text-white',
    rose: 'bg-gradient-to-br from-rose to-[#9c3f22] text-white',
  }[tone]

  const glowToneClass = {
    ink: 'glow-ink',
    amber: 'glow-amber',
    teal: 'glow-teal',
    rose: 'glow-rose',
  }[tone]

  const accentBarClass = {
    ink: 'bg-ink',
    amber: 'bg-amber',
    teal: 'bg-teal',
    rose: 'bg-rose',
  }[tone]

  return (
    <div
      className={`group receipt-panel card-premium shine-sweep p-4 sm:p-5 flex items-start justify-between gap-3 cursor-default ${glowToneClass} ${
        highlight ? 'stat-card-glow' : ''
      }`}
    >
      {/* Top accent bar — appears on hover, reinforces the card's tone */}
      <span
        className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl ${accentBarClass} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
      />

      <div className="min-w-0 relative z-[2]">
        <p className="text-[11px] sm:text-xs font-medium text-ink-muted uppercase tracking-wide truncate">
          {label}
        </p>
        <p className="figure text-xl sm:text-2xl font-semibold text-ink mt-2 transition-transform duration-300 group-hover:translate-x-0.5">
          {value}
          {suffix && <span className="text-sm font-normal text-ink-muted ml-1">{suffix}</span>}
        </p>
      </div>
      <div
        className={`icon-pop relative z-[2] h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${iconToneClass}`}
      >
        <Icon name={icon} className="h-5 w-5" />
      </div>
    </div>
  )
}
