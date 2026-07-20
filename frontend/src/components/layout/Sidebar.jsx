
import { NavLink } from 'react-router-dom'
import Icon from '../common/Icon'
import { NAV_ITEMS } from '../../utils/constants'
import { useAuth } from '../../hooks/useAuth'

/**
 * Sidebar navigation. Persists across all authenticated pages via
 * DashboardLayout. Highlights the active route and hides admin-only
 * items (Suppliers, Reports, Users) from non-admin roles.
 *
 * Two independent display mechanisms live here:
 *  - Mobile (`isOpen` / `onClose`): a slide-in overlay below the `lg`
 *    breakpoint, controlled by DashboardLayout's `sidebarOpen` state.
 *  - Desktop (`collapsed` / `onToggleCollapse`): an icon-only vs. full
 *    width toggle at `lg` and above, controlled by DashboardLayout's
 *    `collapsed` state (persisted to localStorage there).
 * They don't interact with each other.
 */
export default function Sidebar({ isOpen, onClose, collapsed = false, onToggleCollapse }) {
  const { user } = useAuth()

  // Non-admin roles get a lean, task-focused nav — no supplier/report/user
  // management clutter (those routes are also enforced server-side, both
  // via the fixed ADMIN check here and the granular permission system).
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (user?.role !== 'ADMIN') {
      return !['Suppliers', 'Reports', 'Users', 'Barcode Labels'].includes(item.label)
    }
    return true
  })

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-ink/40 z-30 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen bg-ink text-paper z-40 flex flex-col shrink-0 transition-[width,transform] duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${collapsed ? 'w-[72px]' : 'w-64'}`}
      >
        {/* Brand mark + desktop collapse toggle */}
        <div
          className={`flex items-center h-16 border-b border-white/10 shrink-0 gap-2 ${
            collapsed ? 'justify-center px-2' : 'justify-between px-5'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-md bg-amber flex items-center justify-center font-display font-bold text-ink text-sm shrink-0">
              L
            </div>
            {!collapsed && (
              <span className="font-display font-semibold text-[15px] tracking-tight truncate">
                Ledger POS
              </span>
            )}
          </div>

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-paper/60 hover:bg-white/10 hover:text-paper transition-colors"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg
                className={`h-4 w-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* Nav items — scrollable if the list ever grows, scrollbar hidden */}
        <nav className="flex-1 overflow-y-auto scrollbar-hide py-4 px-3 space-y-0.5">
          {visibleItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onClose}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3'
                } ${
                  isActive
                    ? 'bg-amber text-ink'
                    : 'text-paper/70 hover:bg-white/10 hover:text-paper'
                }`
              }
            >
              <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer / role tag — shrinks to just an avatar initial when collapsed */}
        <div
          className={`border-t border-white/10 shrink-0 ${
            collapsed ? 'py-4 flex justify-center' : 'px-5 py-4 text-xs text-paper/50'
          }`}
        >
          {collapsed ? (
            <span
              className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-paper/80"
              title={`Signed in as ${user?.role || 'Guest'}`}
              aria-label={`Signed in as ${user?.role || 'Guest'}`}
            >
              {(user?.role || 'G').charAt(0)}
            </span>
          ) : (
            <>
              Signed in as <span className="text-paper/80 font-medium">{user?.role || 'Guest'}</span>
            </>
          )}
        </div>
      </aside>
    </>
  )
}
