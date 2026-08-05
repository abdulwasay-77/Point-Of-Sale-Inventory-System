
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Icon from '../common/Icon'
import SearchInput from '../common/SearchInput'
import ChatWidget from '../chatbot/ChatWidget'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { toAssetUrl } from '../../utils/assetUrl'

/**
 * Top navbar: global product/customer search, the Store Assistant, the
 * currency switcher, user profile menu, logout, and the mobile sidebar
 * toggle. This bar is present on every authenticated page, so the
 * assistant lives here (as a dropdown, same pattern as the currency/
 * profile menus) rather than as a floating button — a fixed spot in the
 * title bar that never overlaps page content below it.
 */
export default function Navbar({ onMenuClick }) {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  function handleSearchSubmit(e) {
    e.preventDefault()
    if (query.trim()) {
      // Global search sends the cashier/admin straight to the product list
      // filtered by their query — a realistic, simple pattern for this scope.
      navigate(`/products?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <header className="sticky top-0 z-20 h-16 bg-white dark:bg-dark-card border-b border-line dark:border-dark-border flex items-center gap-4 px-4 lg:px-6">
      {/* Mobile menu button */}
      <button
        type="button"
        className="lg:hidden p-2 -ml-2 text-ink-muted dark:text-dark-muted hover:text-ink dark:hover:text-dark-text"
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

      {/* Appearance — per-user, saved to their account (see ThemeContext).
          The full Appearance control (with a label) also lives on the
          Settings page; this is just the quick one-tap toggle. */}
      <button
        type="button"
        onClick={toggleTheme}
        className="p-2 rounded-lg text-ink-muted dark:text-dark-muted hover:bg-paper-dim dark:hover:bg-dark-card2 hover:text-ink dark:hover:text-dark-text transition-colors"
        aria-label={theme === 'DARK' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'DARK' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <Icon name={theme === 'DARK' ? 'sun' : 'moon'} className="h-5 w-5" />
      </button>

      {/* Profile — logout lives on the Profile page itself now, not here. */}
      <Link
        to="/profile"
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-paper-dim dark:hover:bg-dark-card2 transition-colors"
      >
        {user?.avatarUrl ? (
          <img
            src={toAssetUrl(user.avatarUrl)}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="h-8 w-8 rounded-full bg-teal dark:bg-dark-teal text-white flex items-center justify-center text-sm font-semibold font-display">
            {user?.name?.charAt(0) || 'U'}
          </span>
        )}
        <span className="hidden sm:block text-left">
          <span className="block text-sm font-medium text-ink dark:text-dark-text leading-tight">{user?.name || 'User'}</span>
          <span className="block text-xs text-ink-muted dark:text-dark-muted leading-tight">{user?.role || (user?.isPrimaryAdmin ? 'Admin' : '')}</span>
        </span>
      </Link>
    </header>
  )
}


