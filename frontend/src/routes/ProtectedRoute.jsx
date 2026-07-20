
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Loading from '../components/common/Loading'

/**
 * Guards a route behind authentication, and optionally behind a set of
 * allowed roles (e.g. only ADMIN can reach Suppliers/Reports).
 *
 * Usage:
 *   <ProtectedRoute><Dashboard /></ProtectedRoute>
 *   <ProtectedRoute allowedRoles={['ADMIN']}><Reports /></ProtectedRoute>
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <Loading fullScreen message="Checking your session…" />
  }

  if (!isAuthenticated) {
    // Preserve the attempted location so we could redirect back post-login.
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />
  }

  return children
}
