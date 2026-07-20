
import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import Navbar from '../components/layout/Navbar'

const SIDEBAR_COLLAPSE_KEY = 'pos_sidebar_collapsed'

/**
 * Shared shell for every authenticated page: fixed sidebar + top navbar,
 * with the routed page rendered in the scrollable content area. The
 * chatbot assistant lives inside Navbar's title bar (a dropdown, like the
 * currency/profile menus) rather than being mounted as a floating button
 * here — that floating version used to sit on top of page content (most
 * visibly, covering the POS checkout button on short screens); anchored
 * in the title bar it's in a fixed spot on every page and never overlaps
 * anything below it.
 *
 * Owns two independent bits of sidebar state:
 *  - `sidebarOpen`: mobile slide-in overlay visibility.
 *  - `collapsed`: desktop icon-only vs. full-width preference, persisted
 *    to localStorage so it survives a refresh. Because the sidebar uses
 *    `sticky` positioning (not fixed) at the `lg` breakpoint, it already
 *    participates in the flex layout below — changing its width class
 *    is enough for the content area to reflow, no manual margin needed.
 */
export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === 'true'
  })

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(collapsed))
  }, [collapsed])

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        {/* Scrolling now happens here, not on the document. That keeps the
            sidebar permanently in view (it never has to "chase" a page
            scroll) and lets fixed-height pages like POS own their own
            internal scroll regions (e.g. product grid / cart) instead of
            the whole page scrolling. Regular pages that are naturally
            taller than the viewport still scroll normally — just inside
            this container instead of the document.

            `min-h-0` is required here: without it, a flex item's default
            min-height is `auto`, which lets its content push it taller
            than the available space instead of respecting `overflow-y-auto`
            — so pages with a tall inner panel (e.g. POS's cart) would grow
            this whole element and scroll the entire page instead of just
            that panel. */}
        <main className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-[1400px] w-full mx-auto h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
