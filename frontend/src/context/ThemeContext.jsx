import { createContext, useState, useEffect, useCallback } from 'react'
import { profileService } from '../services/profileService'
import { useAuth } from '../hooks/useAuth'

export const ThemeContext = createContext(null)

/**
 * Appearance — per-user (each staff member picks their own, saved to
 * their account — see users.theme_preference in schema.prisma), not a
 * shared business-wide setting. Falls back to localStorage before login
 * completes (so the login page itself can still respect a previous
 * choice on this browser) and syncs to the account once logged in.
 */
export function ThemeProvider({ children }) {
  const { user, isAuthenticated } = useAuth()
  const [theme, setThemeState] = useState(() => localStorage.getItem('pos_theme') || 'LIGHT')

  // Once the logged-in user's own saved preference is known, it takes
  // over from whatever was cached locally.
  useEffect(() => {
    if (user?.themePreference) {
      setThemeState(user.themePreference)
      localStorage.setItem('pos_theme', user.themePreference)
    }
  }, [user?.themePreference])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'DARK')
  }, [theme])

  const setTheme = useCallback(
    (next) => {
      setThemeState(next)
      localStorage.setItem('pos_theme', next)
      if (isAuthenticated) {
        profileService.updateTheme(next).catch(() => {
          // Non-critical — the choice still applies locally even if the
          // save-to-account call fails (e.g. a flaky connection).
        })
      }
    },
    [isAuthenticated],
  )

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'DARK' ? 'LIGHT' : 'DARK')
  }, [theme, setTheme])

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
}
