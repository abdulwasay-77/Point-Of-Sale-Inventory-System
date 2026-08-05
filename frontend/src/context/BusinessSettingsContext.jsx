import { createContext, useState, useEffect, useCallback } from 'react'
import { settingsService } from '../services/settingsService'
import { useAuth } from '../hooks/useAuth'

export const BusinessSettingsContext = createContext(null)

const DEFAULT_NAME = 'Ledger POS'

/**
 * Makes the business's own name/logo (set once, by an admin, on the
 * Settings page — see BusinessSettings in schema.prisma) available
 * anywhere in the app, starting with the Sidebar brand mark. Falls back
 * to "Ledger POS" until an admin sets a Company Name, and to the plain
 * letter badge until a Logo is uploaded — nothing looks unfinished on a
 * brand-new install with nothing configured yet.
 *
 * `refresh()` is exposed so SettingsPage can call it right after saving
 * — the sidebar picks up a new name/logo immediately, without anyone
 * needing to reload the page.
 */
export function BusinessSettingsProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [companyName, setCompanyName] = useState(DEFAULT_NAME)
  const [logoUrl, setLogoUrl] = useState(null)
  const [isLoaded, setIsLoaded] = useState(false)

  const refresh = useCallback(() => {
    // Logged-in users get the full settings payload (this context only
    // reads companyName/logoUrl off it, but other consumers of `.get()`
    // elsewhere, e.g. SettingsPage, want the rest). Logged-out visitors —
    // i.e. whoever is sitting on the Login page — hit the dedicated
    // unauthenticated /settings/public endpoint instead, which exposes
    // just those two branding fields.
    const request = isAuthenticated ? settingsService.get() : settingsService.getPublic()
    request
      .then((res) => {
        const data = res.data.data
        setCompanyName(data.companyName?.trim() || DEFAULT_NAME)
        setLogoUrl(data.logoUrl || null)
        setIsLoaded(true)
      })
      .catch(() => {
        // Settings failing to load shouldn't break the rest of the app —
        // the sidebar/login page just keep showing the default name.
        setIsLoaded(true)
      })
  }, [isAuthenticated])

  useEffect(() => {
    refresh()
  }, [isAuthenticated, refresh])

  return (
    <BusinessSettingsContext.Provider value={{ companyName, logoUrl, isLoaded, refresh }}>
      {children}
    </BusinessSettingsContext.Provider>
  )
}