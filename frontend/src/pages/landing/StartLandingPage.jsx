import { useNavigate } from 'react-router-dom'
import Icon from '../../components/common/Icon'

/**
 * Public landing page for the installed PWA / standalone app.
 *
 * Provides a clean, branded entry point before authentication, allowing
 * staff & store managers to proceed to Business Login, and platform
 * administrators to proceed to Platform Admin Login.
 */
export default function StartLandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-ink relative flex items-center justify-center p-4 sm:p-6 auth-ambient">
      {/* Decorative top receipt tear perforation line */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-tear-line opacity-25 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Main receipt-style container */}
        <div className="receipt-panel auth-card-in px-6 py-8 sm:px-8 sm:py-10">
          {/* Brand header */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-14 w-14 rounded-2xl bg-amber stat-card-glow flex items-center justify-center font-display font-bold text-ink text-2xl mb-4 shadow-md">
              L
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink dark:text-dark-text tracking-tight">
              Ledger POS
            </h1>
            <p className="text-sm text-ink-muted dark:text-dark-muted mt-1.5 max-w-xs">
              Point of sale &amp; inventory management, kept in one unified ledger.
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-4">
            {/* Primary Action: Business Login */}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="btn-accent w-full py-3.5 px-5 text-base font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)] flex items-center justify-center gap-3"
            >
              <Icon name="pos" className="h-5 w-5" />
              <span>Business Login</span>
            </button>

            {/* Secondary Action: Platform Admin Login */}
            <button
              type="button"
              onClick={() => navigate('/platform/login')}
              className="btn-outline w-full py-3.5 px-5 text-base font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card flex items-center justify-center gap-3"
            >
              <Icon name="key" className="h-5 w-5 text-ink-muted dark:text-dark-muted" />
              <span>Platform Admin Login</span>
            </button>
          </div>

          {/* Feature highlights / badges */}
          <div className="mt-8 pt-6 border-t border-line dark:border-dark-border flex items-center justify-center gap-3 text-xs text-ink-muted dark:text-dark-muted">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" />
              POS &amp; Billing
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber" />
              Inventory
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-steel" />
              Multi-tenant
            </span>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-paper/50 mt-5 font-mono">
          Ledger POS • Standalone Edition
        </p>
      </div>
    </div>
  )
}
