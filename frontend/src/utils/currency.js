
// Currency display layer. All amounts are stored and entered in PKR (the
// store's operating currency) — this module only converts for *display*,
// nothing is converted before hitting the backend.
//
// Rates are illustrative fixed snapshots, not live rates. Update `perPKR`
// values here (or swap `getRate` for a live FX API call) to keep them current.

export const CURRENCIES = [
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs', perPKR: 1 },
  { code: 'USD', name: 'US Dollar', symbol: '$', perPKR: 1 / 280 },
  { code: 'EUR', name: 'Euro', symbol: '€', perPKR: 1 / 300 },
  { code: 'GBP', name: 'British Pound', symbol: '£', perPKR: 1 / 355 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', perPKR: 1 / 76 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', perPKR: 1 / 74 },
]

const STORAGE_KEY = 'pos_currency'
const DEFAULT_CODE = 'PKR'

export function getCurrencyCode() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_CODE
}

export function setCurrencyCode(code) {
  localStorage.setItem(STORAGE_KEY, code)
}

export function getCurrency(code = getCurrencyCode()) {
  return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0]
}

/** Convert a PKR amount into the given (or currently selected) currency. */
export function convertFromPKR(amountInPKR, code = getCurrencyCode()) {
  const currency = getCurrency(code)
  return (Number(amountInPKR) || 0) * currency.perPKR
}
