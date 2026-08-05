import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Loading from '../components/common/Loading'

/**
 * Guards a route behind authentication, and optionally behind either a
 * fixed set of role names or (preferred) a specific permission.
 *
 * `requiredPermission` is the right choice for anything gated by one of
 * the keys in backend/src/config/permissions.js — it respects whatever
 * role a permission is granted to, including brand-new roles an admin
 * creates later (see Manage Roles), not just the four built-in ones.
 * `allowedRoles` is a blunter, permission-agnostic check; kept for any
 * case that genuinely needs to key off role identity itself rather than
 * a capability.
 *
 * Usage:
 *   <ProtectedRoute><Dashboard /></ProtectedRoute>
 *   <ProtectedRoute requiredPermission="SUPPLIERS_MANAGE"><Suppliers /></ProtectedRoute>
 *   <ProtectedRoute allowedRoles={['ADMIN']}><SomethingRoleSpecific /></ProtectedRoute>
 */
export default function ProtectedRoute({ children, allowedRoles, requiredPermission }) {
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

  if (requiredPermission && !(user?.permissions || []).includes(requiredPermission)) {
    return <Navigate to="/" replace />
  }

  return children
}