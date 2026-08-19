import { NavLink, useNavigate } from 'react-router-dom'
import Icon from '../common/Icon'
import { NAV_ITEMS } from '../../utils/constants'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import { useBusinessSettings } from '../../hooks/useBusinessSettings'
import { toAssetUrl } from '../../utils/assetUrl'
import { isStandalonePwa } from '../../utils/pwa'

// Which visual group each nav item is bucketed under. Purely presentational
// (grouping/section labels only) — has no bearing on permissions/modules,
// which are still resolved independently below. Anything not listed here
// falls back to "Overview" (currently just Dashboard).
const GROUP_BY_LABEL = {
  Dashboard: 'Overview',
  Products: 'Catalog',
  'Barcode Labels': 'Catalog',
  Categories: 'Catalog',
  Variations: 'Catalog',
  Units: 'Catalog',
  'Kits & Bundles': 'Catalog',
  Purchases: 'Operations',
  Inventory: 'Operations',
  Warehouses: 'Operations',
  Suppliers: 'Operations',
  POS: 'Sales & POS',
  Sales: 'Sales & POS',
  Customers: 'Sales & POS',
  'Customer Credit': 'Sales & POS',
  Installments: 'Sales & POS',
  Payroll: 'Finance',
  Expenses: 'Finance',
  Reports: 'Finance',
  Users: 'Administration',
  Profile: 'Administration',
  Settings: 'Administration',
  Billing: 'Administration',
}
// Fixed display order for groups — independent of NAV_ITEMS' own order,
// so the sidebar's section order never depends on how that array is
// arranged.
const GROUP_ORDER = ['Overview', 'Catalog', 'Operations', 'Sales & POS', 'Finance', 'Administration']

/**
 * Sidebar navigation. Persists across all authenticated pages via
 * DashboardLayout. Highlights the active route and hides items the
 * current user doesn't have the permission for.
 *
 * Two independent display mechanisms live here:
 *  - Mobile (`isOpen` / `onClose`): a slide-in overlay below the `lg`
 *    breakpoint, controlled by DashboardLayout's `sidebarOpen` state.
 *  - Desktop (`collapsed` / `onToggleCollapse`): an icon-only vs. full
 *    width toggle at `lg` and above, controlled by DashboardLayout's
 *    `collapsed` state (persisted to localStorage there).
 * They don't interact with each other.
 *
 * Nav items are grouped into labeled sections (Overview/Catalog/Operations/
 * Sales & POS/Finance/Administration, see GROUP_BY_LABEL above) purely for
 * visual scanability — grouping carries no permission logic of its own.
 * When collapsed, section labels collapse into thin dividers instead.
 *
 * Footer also hosts a Logout button (cloned from ProfilePage's, which
 * remains the other place logout lives — see ProfilePage.jsx) so users
 * don't have to open the Profile page just to sign out.
 */
export default function Sidebar({ isOpen, onClose, collapsed = false, onToggleCollapse }) {
  const { logout, user } = useAuth()
  const { has } = usePermissions()
  const { companyName, logoUrl } = useBusinessSettings()
  const navigate = useNavigate()

  // Which business-level module (see backend/src/config/modules.js) each
  // nav item belongs to. This is a SEPARATE gate from PERMISSION_BY_LABEL
  // below — a module being off means the business's plan doesn't include
  // that feature at all, regardless of the user's role/permissions (the
  // backend enforces this the same way — see authMiddleware.js). Items
  // left out (Dashboard, Profile, Settings, Users) are core and always
  // available to every active business.
  const MODULE_BY_LABEL = {
    Products: 'PRODUCTS',
    'Barcode Labels': 'PRODUCTS',
    Categories: 'PRODUCTS',
    Variations: 'PRODUCTS',
    Units: 'UNITS',
    Customers: 'CONTACTS',
    Suppliers: 'CONTACTS',
    Purchases: 'PURCHASES',
    Inventory: 'INVENTORY',
    'Kits & Bundles': 'KITS',
    Warehouses: 'INVENTORY',
    POS: 'SALES',
    Sales: 'SALES',
    'Customer Credit': 'CREDIT',
    Installments: 'INSTALLMENTS',
    Payroll: 'PAYROLL',
    Expenses: 'EXPENSES',
    Reports: 'REPORTS',
  }
  const enabledModules = user?.enabledModules || null

  // Every nav item is gated by its actual permission (see App.jsx's
  // ProtectedRoute requiredPermission on the matching route, and
  // permissionMiddleware on the matching backend route — all three check
  // the same key). This map used to only cover 5 items (Suppliers,
  // Reports, Users, Barcode Labels, Payroll); everything else silently
  // fell through to "always visible" regardless of the user's actual
  // permissions — e.g. a role with only DASHBOARD_VIEW would still see
  // every other link. Fixed: every item that isn't universally available
  // (only Profile is) now has an explicit entry here.
  const PERMISSION_BY_LABEL = {
    Dashboard: 'DASHBOARD_VIEW',
    Products: 'PRODUCTS_VIEW',
    'Barcode Labels': 'BARCODES_MANAGE',
    Categories: 'CATEGORIES_MANAGE',
    Variations: 'VARIATIONS_MANAGE',
    Units: 'UNITS_MANAGE',
    Customers: 'CUSTOMERS_MANAGE',
    Suppliers: 'SUPPLIERS_MANAGE',
    Purchases: 'PURCHASES_VIEW',
    Inventory: 'INVENTORY_VIEW',
    'Kits & Bundles': 'KITS_MANAGE',
    Warehouses: 'WAREHOUSES_MANAGE',
    POS: 'SALES_CHECKOUT',
    Sales: 'SALES_VIEW',
    'Customer Credit': 'CREDIT_MANAGE',
    Installments: 'INSTALLMENTS_MANAGE',
    Payroll: 'PAYROLL_MANAGE',
    // EXPENSES_RECORD (not EXPENSES_MANAGE) — every staff member gets
    // this permission by default (see the staff_expenses migration), so
    // the link shows for everyone, same as Payroll shows only for
    // roles with PAYROLL_MANAGE. The extra admin tabs inside the page
    // itself (Budget & Limits, All Staff History) are then gated on
    // EXPENSES_MANAGE — see ExpensesPage.jsx.
    Expenses: 'EXPENSES_RECORD',
    Reports: 'REPORTS_VIEW',
    Users: 'USERS_MANAGE',
    Settings: 'SETTINGS_MANAGE',
    Billing: 'BILLING_MANAGE',
    // Profile is deliberately left out of this map — every logged-in
    // user can always see their own profile page, regardless of role.
  }
  const visibleItems = NAV_ITEMS.filter((item) => {
    const requiredPermission = PERMISSION_BY_LABEL[item.label]
    if (requiredPermission && !has(requiredPermission)) return false
    const requiredModule = MODULE_BY_LABEL[item.label]
    if (requiredModule && enabledModules && !enabledModules.includes(requiredModule)) return false
    return true
  })

  // Bucket the already-permission-filtered items into their display
  // groups, in GROUP_ORDER order, dropping any group left empty by the
  // filtering above (e.g. a cashier role with no Finance-tier items).
  const groupedNav = GROUP_ORDER.map((group) => ({
    group,
    items: visibleItems.filter((item) => (GROUP_BY_LABEL[item.label] || 'Overview') === group),
  })).filter((g) => g.items.length > 0)

  async function handleLogout() {
    await logout()
    navigate(isStandalonePwa() ? '/start' : '/login')
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-30 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        data-keyboard-sidebar
        className={`fixed lg:sticky top-0 left-0 h-screen bg-gradient-to-b from-ink to-[#171b24] text-paper z-40 flex flex-col shrink-0 transition-[width,transform] duration-200 ease-in-out shadow-[4px_0_24px_-8px_rgba(0,0,0,0.35)] ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${collapsed ? 'w-[92px]' : 'w-64'}`}
      >
        {/* Brand mark + desktop collapse toggle.
            `relative` is the positioning context for the collapsed-state
            toggle button. The two states render the logo/button pair in
            genuinely different DOM order (rather than leaning on CSS
            `order`) so there's no ambiguity about which sits where:
             - Expanded: logo/name first, button second — plain, normal
               flex order, exactly as laid out visually.
             - Collapsed: button first, logo second, so the logo (which
               comes after it in the DOM) can target the button with
               Tailwind's `peer`/`peer-hover` for the reveal animation. */}
        <div
          className={`relative flex items-center h-16 border-b border-white/10 shrink-0 ${
            collapsed ? 'justify-center px-2' : 'justify-between gap-2 px-5'
          }`}
        >
          {collapsed ? (
            <>
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  // Pulled out of the flex flow (`absolute`) so it reserves
                  // no space and the logo can sit dead-center. Stays fully
                  // invisible at rest — nothing but a quiet hit-area — and
                  // only *that exact spot* being hovered/focused reveals
                  // it, via its own `hover`/`focus-visible` states, marked
                  // `peer` so the logo (below) can react too.
                  className="peer hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-paper/60 transition-all duration-200 ease-in-out absolute right-2 top-1/2 -translate-y-1/2 opacity-0 scale-75 hover:text-amber hover:bg-white/10 dark:hover:bg-dark-card/10 hover:shadow-[0_0_0_1px_rgba(232,163,61,0.45),0_0_16px_3px_rgba(232,163,61,0.35)] hover:opacity-100 hover:scale-100 focus-visible:text-amber focus-visible:opacity-100 focus-visible:scale-100"
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <line x1="9.5" y1="4" x2="9.5" y2="20" />
                    <polyline points="13.5 9 16.5 12 13.5 15" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}

              <div
                className={`flex items-center gap-2.5 min-w-0 transition-transform duration-200 ease-in-out ${
                  onToggleCollapse ? 'peer-hover:-translate-x-3 peer-focus-visible:-translate-x-3' : ''
                }`}
              >
                {logoUrl ? (
                  <div
                    className="shine-sweep sidebar-logo-in h-8 w-8 rounded-md overflow-hidden shrink-0 ring-1 ring-white/15"
                    title={companyName}
                  >
                    <img src={toAssetUrl(logoUrl)} alt={companyName} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div
                    className="h-8 w-8 rounded-md bg-amber flex items-center justify-center font-display font-bold text-ink dark:text-dark-text text-sm shrink-0"
                    title={companyName}
                  >
                    {companyName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                {logoUrl ? (
                  <div
                    className="shine-sweep sidebar-logo-in h-8 w-8 rounded-md overflow-hidden shrink-0 ring-1 ring-white/15"
                    title={companyName}
                  >
                    <img src={toAssetUrl(logoUrl)} alt={companyName} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div
                    className="h-8 w-8 rounded-md bg-amber flex items-center justify-center font-display font-bold text-ink dark:text-dark-text text-sm shrink-0"
                    title={companyName}
                  >
                    {companyName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="font-display font-semibold text-[15px] tracking-tight truncate">
                  {companyName}
                </span>
              </div>

              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-paper/60 transition-all duration-200 ease-in-out hover:text-amber hover:bg-white/10 dark:hover:bg-dark-card/10 hover:shadow-[0_0_0_1px_rgba(232,163,61,0.45),0_0_16px_3px_rgba(232,163,61,0.35)] focus-visible:text-amber"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <line x1="9.5" y1="4" x2="9.5" y2="20" />
                    <polyline points="16.5 9 13.5 12 16.5 15" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>

        {/* Nav items — scrollable if the list ever grows, scrollbar hidden.
            Grouped into labeled sections for scanability; each section
            gets a small uppercase heading when expanded, or just a hairline
            divider (skipping the very first section, which needs none)
            when collapsed to icon-only. */}
        <nav className="flex-1 overflow-y-auto scrollbar-hide py-3 px-3 space-y-1">
          {groupedNav.map(({ group, items }, groupIndex) => (
            <div key={group}>
              {collapsed ? (
                groupIndex > 0 && <div className="my-2 border-t border-white/10" aria-hidden="true" />
              ) : (
                <div
                  className={`px-3 text-[10.5px] font-semibold uppercase tracking-wider text-paper/35 select-none ${
                    groupIndex === 0 ? 'pt-1 pb-1.5' : 'pt-4 pb-1.5'
                  }`}
                >
                  {group}
                </div>
              )}

              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `group relative flex items-center rounded-lg py-2.5 text-sm font-medium transition-all duration-150 ${
                        collapsed ? 'justify-center px-0' : 'gap-3 px-3'
                      } ${
                        isActive
                          ? 'bg-amber text-ink dark:text-dark-text shadow-[0_2px_10px_-2px_rgba(232,163,61,0.55)]'
                          : 'text-paper/65 hover:bg-white/[0.07] hover:text-paper'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Active-route indicator bar — sits flush against the
                            sidebar's own left edge (offset to clear the
                            aside's rounded/shadow edge), a common "premium"
                            nav tell that reads clearly even at a glance. */}
                        {isActive && (
                          <span
                            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 h-4 w-[3px] rounded-full bg-amber lg:block hidden"
                            aria-hidden="true"
                          />
                        )}
                        <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}

                        {/* Collapsed-mode tooltip — flyout label on hover/focus,
                            since the icon alone loses its caption. Pure CSS,
                            no extra state; native `title` still backs it up. */}
                        {collapsed && (
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-ink dark:bg-dark-card px-2.5 py-1.5 text-xs font-medium text-paper dark:text-dark-text opacity-0 scale-95 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.45)] ring-1 ring-white/10 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 group-focus-visible:opacity-100 group-focus-visible:scale-100 z-50 hidden lg:block"
                          >
                            {item.label}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer — Logout button (cloned from ProfilePage's Log Out
            button/behavior) so signing out doesn't require a trip to the
            Profile page. Replaces the old "Signed in as ROLE" status line. */}
        <div
          className={`border-t border-white/10 shrink-0 ${
            collapsed ? 'py-4 flex justify-center' : 'px-3 py-4'
          }`}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={handleLogout}
              className="group relative h-9 w-9 rounded-lg flex items-center justify-center text-rose dark:text-dark-rose hover:bg-rose/10 transition-colors"
              aria-label="Log Out"
              title="Log Out"
            >
              <Icon name="logout" className="h-[18px] w-[18px]" />
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-ink dark:bg-dark-card px-2.5 py-1.5 text-xs font-medium text-paper dark:text-dark-text opacity-0 scale-95 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.45)] ring-1 ring-white/10 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 z-50 hidden lg:block"
              >
                Log Out
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-rose dark:text-dark-rose bg-rose/[0.08] hover:bg-rose/15 transition-colors"
              onClick={handleLogout}
            >
              <Icon name="logout" className="h-4 w-4" />
              Log Out
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
