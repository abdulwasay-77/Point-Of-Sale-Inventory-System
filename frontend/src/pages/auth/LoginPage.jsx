import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { toAssetUrl } from '../../utils/assetUrl'
import Icon from '../../components/common/Icon'

/**
 * Login page. Authenticates against the real backend (/api/auth/login);
 * the role shown afterwards comes back from the server on the user object,
 * so there's no client-side role picker.
 *
 * Premium pass: matches the dashboard's visual language rather than
 * sitting apart from it —
 *  - the brand mark shows the admin-configured Business Info (see
 *    BusinessSettingsContext) — company name and, if uploaded, logo —
 *    same source Sidebar.jsx uses, so the two never disagree. Falls back
 *    to "Ledger POS" and a plain letter badge until an admin sets those,
 *    exactly like the sidebar does. An uploaded logo gets an animated
 *    entrance + ambient glow (`.login-logo-in`, defined in index.css)
 *    instead of just appearing as a static <img>; no logo yet keeps the
 *    letter badge's `.stat-card-glow` pulse from before.
 *  - email/password fields get inline icons and the password field gets
 *    a show/hide toggle, both reusing `.input-field` untouched (icons sit
 *    in an absolutely-positioned overlay, so no new input variant needed).
 *  - the sign-in button picks up the same hover-lift + glow-shadow used
 *    on primary actions elsewhere (Dashboard's "Start a new sale", POS's
 *    checkout button).
 *  - the card animates in with `.auth-card-in` instead of just appearing.
 */
export default function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const { companyName, logoUrl } = useBusinessSettings()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAuthenticated) {
    const redirectTo = location.state?.from?.pathname || '/'
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password.trim()) {
      setError('Enter both an email and a password to continue.')
      return
    }

    setIsSubmitting(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'We could not sign you in. Check your details and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Receipt-style card — the login "ticket" into the store */}
      <div className="receipt-panel auth-card-in px-8 pt-8 pb-10">
        <div className="flex flex-col items-center text-center mb-8">
          {logoUrl ? (
            <div
              className="shine-sweep login-logo-in h-14 w-14 rounded-xl overflow-hidden mb-3 ring-1 ring-line dark:ring-dark-border"
              title={companyName}
            >
              <img src={toAssetUrl(logoUrl)} alt={companyName} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="h-11 w-11 rounded-lg bg-amber stat-card-glow flex items-center justify-center font-display font-bold text-ink dark:text-dark-text text-lg mb-3">
              {companyName.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="font-display text-xl font-semibold text-ink dark:text-dark-text">{companyName}</h1>
          <p className="text-sm text-ink-muted dark:text-dark-muted mt-1">Sign in to run the register</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="label-text">
              Email
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-muted dark:text-dark-muted">
                <Icon name="mail" className="h-4 w-4" />
              </span>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@store.com"
                className="input-field pl-9"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="label-text">
              Password
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-muted dark:text-dark-muted">
                <Icon name="lock" className="h-4 w-4" />
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field pl-9 pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-muted dark:text-dark-muted transition-colors duration-150 hover:text-ink dark:hover:text-dark-text"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-4 w-4" />
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-accent w-full mt-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(232,163,61,0.55)] disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-paper/50 mt-5">Point of sale &amp; inventory, kept in one ledger.</p>
    </div>
  )
}