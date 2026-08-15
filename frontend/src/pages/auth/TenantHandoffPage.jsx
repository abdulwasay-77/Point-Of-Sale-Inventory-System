import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

/**
 * Destination of the post-login subdomain redirect (see AuthContext.jsx
 * #maybeRedirectToTenantSubdomain). A user who logs in on the bare
 * domain gets sent here, on their OWN business's subdomain, with the
 * session token in the URL fragment:
 *
 *   https://alimart.pos.com/auth/handoff#token=eyJ...
 *
 * This exists because localStorage is scoped per-origin — a token
 * saved while on the bare domain is invisible on alimart.pos.com, even
 * though it's the same app. The fragment (not a query param) is
 * deliberate: fragments are never sent to the server or included in
 * the Referer header, so the token doesn't end up in any server log
 * just by virtue of this redirect happening.
 *
 * Security note / flagged design decision: this reuses the same
 * long-lived session token minted at login, rather than a separate
 * short-lived single-use handoff token. That's simpler and was chosen
 * as the default, but it does mean the real session token is briefly
 * present in the URL/browser history until the cleanup below runs. If
 * that's not an acceptable tradeoff, the fix is a dedicated backend
 * endpoint that exchanges a short-lived one-time code for the real
 * token, minted specifically for this handoff — flagged here rather
 * than silently built in.
 */
export default function TenantHandoffPage() {
  const { loginWithToken } = useAuth()
  const navigate = useNavigate()
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const hash = window.location.hash.replace(/^#/, '')
    const params = new URLSearchParams(hash)
    const token = params.get('token')

    // Clear the fragment immediately regardless of outcome — the token
    // (or a malformed/missing one) should never linger in the address
    // bar or browser history any longer than this one tick.
    window.history.replaceState(null, '', window.location.pathname)

    if (!token) {
      navigate('/login', { replace: true })
      return
    }

    loginWithToken(token)
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/login', { replace: true }))
  }, [loginWithToken, navigate])

  return null
}
