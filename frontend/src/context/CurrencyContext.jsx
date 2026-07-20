
import { createContext, useState, useCallback } from 'react'
import { getCurrencyCode, setCurrencyCode as persistCurrencyCode } from '../utils/currency'

export const CurrencyContext = createContext(null)

/**
 * Holds the selected display currency (see utils/currency.js). Amounts are
 * always stored/entered in PKR — this only controls how formatCurrency()
 * renders them.
 *
 * main.jsx remounts <App> on currency change (via `key`) so every already-
 * rendered price on screen picks up the new conversion immediately, without
 * every page needing to subscribe to this context individually.
 */
export function CurrencyProvider({ children }) {
  const [currencyCode, setCurrencyCodeState] = useState(getCurrencyCode())

  const setCurrencyCode = useCallback((code) => {
    persistCurrencyCode(code)
    setCurrencyCodeState(code)
  }, [])

  return (
    <CurrencyContext.Provider value={{ currencyCode, setCurrencyCode }}>
      {children}
    </CurrencyContext.Provider>
  )
}
