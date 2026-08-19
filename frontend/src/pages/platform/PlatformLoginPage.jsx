import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { platformAuthService } from '../../services/platformAuthService'
import Icon from '../../components/common/Icon'
import { useTheme } from '../../hooks/useTheme'

/**
 * Super Admin login — deliberately not built on the tenant LoginPage or
 * useAuth(): platform sessions are a completely separate token/storage
 * key (see platformAxiosInstance.js) and there's no per-business
 * branding to show here (no BusinessSettingsContext — Business doesn't
 * exist yet from this screen's point of view).
 *
 * The theme toggle below is the one piece borrowed from the tenant app
 * (same useTheme()/Icon pattern as Navbar.jsx) — safe to reuse because
 * ThemeProvider already wraps every route, including this one, from
 * main.jsx. See index.html for the no-flash inline script that applies
 * the saved theme before first paint.
 */
export default function PlatformLoginPage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const existingToken = localStorage.getItem('platform_token')
  if (existingToken) {
    return <Navigate to="/platform/dashboard" replace />
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
      const { data } = await platformAuthService.login({ email, password })
      localStorage.setItem('platform_token', data.data.token)
      localStorage.setItem('platform_admin', JSON.stringify(data.data.admin))
      navigate('/platform/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'We could not sign you in. Check your details and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div data-keyboard-scope className="min-h-screen flex items-center justify-center bg-ink relative auth-ambient px-4">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 z-10 p-2 rounded-lg text-paper/70 hover:bg-white/10 hover:text-paper transition-colors"
        aria-label={theme === 'DARK' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'DARK' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <Icon name={theme === 'DARK' ? 'sun' : 'moon'} className="h-5 w-5" />
      </button>

      <div className="relative z-10 w-full max-w-md">
        <div className="receipt-panel px-8 pt-8 pb-10">
          <div className="text-center mb-8">
            <div className="h-11 w-11 mx-auto rounded-lg bg-amber flex items-center justify-center font-display font-bold text-ink text-lg mb-3">
              SA
            </div>
            <h1 className="font-display text-xl font-semibold text-ink dark:text-dark-text">Platform Admin</h1>
            <p className="text-sm text-ink-muted dark:text-dark-muted mt-1">Manage businesses on this platform</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="label-text">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@platform.com"
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor="password" className="label-text">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
              />
            </div>

            {error && (
              <p className="text-sm text-rose dark:text-dark-rose bg-rose-light dark:bg-dark-rose/15 rounded-lg px-3 py-2" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={isSubmitting} className="btn-accent w-full mt-2">
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => navigate('/start')}
                className="text-xs text-ink-muted dark:text-dark-muted hover:text-amber dark:hover:text-amber transition-colors inline-flex items-center gap-1.5"
              >
                <span>← Back to Start</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
