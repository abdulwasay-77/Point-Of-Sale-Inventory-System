
import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import Icon from '../../components/common/Icon'

/**
 * Login page. Authenticates against the real backend (/api/auth/login);
 * the role shown afterwards comes back from the server on the user object,
 * so there's no client-side role picker.
 *
 * Premium pass: matches the dashboard's visual language rather than
 * sitting apart from it —
 *  - the "L" brand mark carries the same soft amber pulse used on the
 *    dashboard's "Today's Sales" highlight (`.stat-card-glow`): one
 *    accent, spent on the single most recognizable element here.
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
          <div className="h-11 w-11 rounded-lg bg-amber stat-card-glow flex items-center justify-center font-display font-bold text-ink text-lg mb-3">
            L
          </div>
          <h1 className="font-display text-xl font-semibold text-ink">Ledger POS</h1>
          <p className="text-sm text-ink-muted mt-1">Sign in to run the register</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="label-text">
              Email
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-muted">
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
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-muted">
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
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-muted transition-colors duration-150 hover:text-ink"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-4 w-4" />
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose bg-rose-light rounded-lg px-3 py-2" role="alert">
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
