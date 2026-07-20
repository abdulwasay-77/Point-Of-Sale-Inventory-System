
import { Outlet } from 'react-router-dom'

/**
 * Minimal centered shell for unauthenticated pages (currently just Login).
 * Kept separate from DashboardLayout since it has no sidebar/navbar.
 *
 * Premium pass: picks up the same ambient-glow-blob technique used on the
 * dashboard (`.auth-ambient`, a dark-tuned sibling of `.dashboard-ambient`)
 * so the very first screen someone sees already feels like this app, not
 * a generic centered form. A thin amber tear-line along the top edge is a
 * quiet callback to the receipt/ledger motif used everywhere else (POS
 * cart, invoices) — this is the one "ticket" a cashier is handed before
 * they can open the till.
 */
export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-ink relative flex items-center justify-center p-4 auth-ambient">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-tear-line opacity-25 pointer-events-none" />
      <div className="relative z-10 w-full flex justify-center">
        <Outlet />
      </div>
    </div>
  )
}
