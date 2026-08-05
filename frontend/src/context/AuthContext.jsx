import { createContext, useState, useEffect } from 'react'
import { authService } from '../services/authService'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

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

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}