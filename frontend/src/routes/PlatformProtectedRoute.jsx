import { Navigate } from 'react-router-dom'

// Deliberately independent of the tenant ProtectedRoute/useAuth() — a
// platform session is a different token entirely (see
// platformAxiosInstance.js), so this checks localStorage directly
// rather than any tenant auth context.
export default function PlatformProtectedRoute({ children }) {
  const token = localStorage.getItem('platform_token')
  if (!token) {
    return <Navigate to="/platform/login" replace />
  }
  return children
}
