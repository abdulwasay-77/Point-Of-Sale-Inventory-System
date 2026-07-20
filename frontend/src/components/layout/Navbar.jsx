
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../common/Icon'
import SearchInput from '../common/SearchInput'
import ChatWidget from '../chatbot/ChatWidget'
import { useAuth } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import { CURRENCIES, getCurrency } from '../../utils/currency'

/**
 * Top navbar: global product/customer search, the Store Assistant, the
 * currency switcher, user profile menu, logout, and the mobile sidebar
 * toggle. This bar is present on every authenticated page, so the
 * assistant lives here (as a dropdown, same pattern as the currency/
 * profile menus) rather than as a floating button — a fixed spot in the
 * title bar that never overlaps page content below it.
 */
export default function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth()
  const { currencyCode, setCurrencyCode } = useCurrency()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const currencyMenuRef = useRef(null)

  // Close the profile dropdown when clicking outside it.
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
      if (currencyMenuRef.current && !currencyMenuRef.current.contains(e.target)) {
        setCurrencyMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSearchSubmit(e) {
    e.preventDefault()
    if (query.trim()) {
      // Global search sends the cashier/admin straight to the product list
      // filtered by their query — a realistic, simple pattern for this scope.
      navigate(`/products?q=${encodeURIComponent(query.trim())}`)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-20 h-16 bg-white border-b border-line flex items-center gap-4 px-4 lg:px-6">
      {/* Mobile menu button */}
      <button
        type="button"
        className="lg:hidden p-2 -ml-2 text-ink-muted hover:text-ink"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md">
        <SearchInput value={query} onChange={setQuery} placeholder="Search products, SKU…" />
      </form>

      <div className="flex-1" />

      <ChatWidget />

      {/* Currency switcher — amounts are stored in PKR, this only changes
          how they're displayed (see utils/currency.js) */}
      <div className="relative" ref={currencyMenuRef}>
        <button
          type="button"
          onClick={() => setCurrencyMenuOpen((prev) => !prev)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-muted hover:bg-paper-dim hover:text-ink transition-colors"
          aria-label="Change display currency"
        >
          <span className="figure">{getCurrency(currencyCode).symbol}</span>
          <span className="hidden sm:inline">{currencyCode}</span>
          <Icon name="chevronDown" className="h-3.5 w-3.5" />
        </button>

        {currencyMenuOpen && (
          <div className="absolute right-0 mt-2 w-52 card py-1.5 z-30">
            {CURRENCIES.map((currency) => (
              <button
                key={currency.code}
                type="button"
                onClick={() => {
                  setCurrencyCode(currency.code)
                  setCurrencyMenuOpen(false)
                }}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-paper-dim transition-colors ${
                  currency.code === currencyCode ? 'text-amber-dark font-medium' : 'text-ink'
                }`}
              >
                <span>
                  {currency.name} <span className="text-ink-muted">({currency.code})</span>
                </span>
                <span className="figure">{currency.symbol}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Profile menu */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-paper-dim transition-colors"
        >
          <span className="h-8 w-8 rounded-full bg-teal text-white flex items-center justify-center text-sm font-semibold font-display">
            {user?.name?.charAt(0) || 'U'}
          </span>
          <span className="hidden sm:block text-left">
            <span className="block text-sm font-medium text-ink leading-tight">{user?.name || 'User'}</span>
            <span className="block text-xs text-ink-muted leading-tight">{user?.role || ''}</span>
          </span>
          <Icon name="chevronDown" className="h-4 w-4 text-ink-muted hidden sm:block" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-48 card py-1.5 z-30">
            <div className="px-4 py-2 border-b border-line">
              <p className="text-sm font-medium text-ink">{user?.name}</p>
              <p className="text-xs text-ink-muted">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose hover:bg-rose-light transition-colors"
            >
              <Icon name="logout" className="h-4 w-4" />
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
