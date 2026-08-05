import { useAuth } from './useAuth'

/**
 * Reads the current user's effective permissions (granted by the backend
 * at login — see auth.service.js#login) and exposes a simple `has()`
 * check. This mirrors the backend's own permission model (config/
 * permissions.js) rather than hardcoding role checks in components, so a
 * permission override made in the Users screen is respected here too.
 *
 * Note: permissions are a snapshot from login time. If an admin changes
 * someone's permissions mid-session, that user needs to log out and back
 * in to see the change reflected here — the same staleness that already
 * applies to the JWT's role claim elsewhere in the app.
 */
export function usePermissions() {
  const { user } = useAuth()
  const permissions = user?.permissions || []

  function has(permission) {
    return permissions.includes(permission)
  }

  return { permissions, has }
}
