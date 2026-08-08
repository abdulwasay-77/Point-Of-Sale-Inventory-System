import { createContext, useState, useEffect, useCallback, useRef } from 'react'
import { authService } from '../services/authService'

export const AuthContext = createContext(null)

// How often to silently re-check /api/auth/me in the background while the
// app is open, as a backstop for the focus-based refresh below (e.g. long
// browser sessions on a screen nobody ever "returns focus" to, like a
// dedicated POS terminal display).
const BACKGROUND_REFRESH_INTERVAL_MS = 3 * 60 * 1000 // 3 minutes

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  // Mirrors `user` for use inside the focus/interval listeners below,
  // without those effects needing to re-subscribe every time `user`
  // changes (which would tear down/rebuild the interval on every refresh).
  const userRef = useRef(null)
  useEffect(() => {
    userRef.current = user
  }, [user])

  // On first load, restore the session from localStorage (if a token/user
  // was saved from a previous login) so refreshing the page doesn't log
  // the user out.
  useEffect(() => {
    const storedUser = localStorage.getItem('pos_user')
    const token = localStorage.getItem('pos_token')
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser))
      } catch {
        localStorage.removeItem('pos_user')
        localStorage.removeItem('pos_token')
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (email, password) => {
    const response = await authService.login({ email, password })
    const { token, user: loggedInUser } = response.data.data

    localStorage.setItem('pos_token', token)
    localStorage.setItem('pos_user', JSON.stringify(loggedInUser))
    setUser(loggedInUser)
    return loggedInUser
  }

  const logout = async () => {
    try {
      await authService.logout()
    } catch {
      // Even if the request fails, still clear the local session.
    }
    localStorage.removeItem('pos_token')
    localStorage.removeItem('pos_user')
    setUser(null)
  }

  // Merges partial updates (e.g. a new avatarUrl, a changed name) into the
  // current user — both in memory and in localStorage, so every consumer
  // of useAuth() (Navbar's avatar/name, Sidebar's role tag, etc.) reflects
  // the change immediately, without needing a fresh login to pick it up.
  const updateUser = (patch) => {
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      localStorage.setItem('pos_user', JSON.stringify(next))
      return next
    })
  }

  // Re-fetches the current user from GET /api/auth/me and merges the
  // result in. This is what actually picks up things that can change out
  // from under an already-logged-in session — a Super Admin toggling
  // enabledModules, a role's permissions being edited, the account being
  // deactivated/reactivated — none of which are pushed to the client any
  // other way. Silent by design: called in the background (see effects
  // below), so a transient network hiccup shouldn't disrupt the user or
  // surface an error toast. An actual auth failure (expired/invalid
  // token, deactivated account) does still log the user out, same as any
  // other 401 would.
  const refreshUser = useCallback(async () => {
    if (!localStorage.getItem('pos_token')) return
    try {
      const response = await authService.getProfile()
      const freshUser = response.data.data
      localStorage.setItem('pos_user', JSON.stringify(freshUser))
      setUser(freshUser)
    } catch (error) {
      if (error?.response?.status === 401) {
        localStorage.removeItem('pos_token')
        localStorage.removeItem('pos_user')
        setUser(null)
      }
      // Any other error (network blip, server hiccup) is ignored — the
      // next scheduled refresh will just try again.
    }
  }, [])

  // Background refresh: once on load (right after restoring the stored
  // session), whenever the tab regains focus, and on a fixed interval as
  // a backstop for tabs/terminals that never lose focus. Together these
  // mean a module or permission change made in the Super Admin panel
  // shows up in an already-open session within a few minutes at worst,
  // and immediately on the next tab-switch back — without ever requiring
  // the user to log out and back in.
  useEffect(() => {
    if (isLoading) return
    if (!userRef.current) return

    refreshUser()

    const handleFocus = () => {
      if (userRef.current) refreshUser()
    }
    window.addEventListener('focus', handleFocus)

    const intervalId = setInterval(() => {
      if (userRef.current) refreshUser()
    }, BACKGROUND_REFRESH_INTERVAL_MS)

    return () => {
      window.removeEventListener('focus', handleFocus)
      clearInterval(intervalId)
    }
  }, [isLoading, refreshUser])

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}