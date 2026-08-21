import { Navigate } from 'react-router-dom'
import { isTenantSubdomain, isPlatformSubdomain, buildPlatformUrl } from '../utils/tenantUrl'

// Deliberately independent of the tenant ProtectedRoute/useAuth() — a
// platform session is a different token entirely (see
// platformAxiosInstance.js), so this checks localStorage directly
// rather than any tenant auth context.
export default function PlatformProtectedRoute({ children }) {
  // If accessed from a tenant business subdomain, bounce to platform login
  if (isTenantSubdomain()) {
    window.location.href = buildPlatformUrl('/platform/login')
    return null
  }

  // If APP_DOMAIN is set but we're NOT on the platform admin subdomain
  // (e.g. someone visits localhost:5173/platform/dashboard directly),
  // redirect them to the correct platformadmin subdomain URL.
  if (!isPlatformSubdomain()) {
    const platformUrl = buildPlatformUrl('/platform/login')
    // Only redirect if the URL would actually be different from the current origin
    // (when APP_DOMAIN is not configured, buildPlatformUrl returns the same host)
    if (platformUrl !== `${window.location.protocol}//${window.location.host}/platform/login`) {
      window.location.href = platformUrl
      return null
    }
  }

  const token = localStorage.getItem('platform_token')
  if (!token) {
    return <Navigate to="/platform/login" replace />
  }
  return children
}
