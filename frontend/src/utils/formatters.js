
// Shared formatting helpers used across pages.
import { getCurrency, convertFromPKR } from './currency'

/**
 * Format a PKR amount in whichever currency the user has selected
 * (Navbar currency switcher), e.g. 1200 -> "Rs 1,200.00" or "$4.29".
 * Amounts are always stored/entered in PKR; this only converts for display.
 */
export function formatCurrency(amountInPKR) {
  const currency = getCurrency()
  const converted = convertFromPKR(amountInPKR, currency.code)
  const formattedNumber = converted.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${currency.symbol} ${formattedNumber}`
}

/** Format an ISO date string as "Jul 14, 2026" */
export function formatDate(dateString) {
  if (!dateString) return '—'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Format an ISO date string with time, e.g. "Jul 14, 2026, 3:45 PM" */
export function formatDateTime(dateString) {
  if (!dateString) return '—'
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
