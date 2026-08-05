// A small, hand-picked set of inline SVG icons so the project has zero
// icon-library dependency. Each renders at 20x20 by default and inherits
// currentColor, so it tints correctly in both the light sidebar item and
// the active/dark state.
const paths = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  products: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  // Price tag — distinct from the "layers" mark now used for Variations.
  categories: 'M12.6 2.6A2 2 0 0011.2 2H4a2 2 0 00-2 2v7.2a2 2 0 00.6 1.4l8.7 8.7a2.4 2.4 0 003.4 0l6.6-6.6a2.4 2.4 0 000-3.4zM7.5 7.5a1 1 0 110-2 1 1 0 010 2z',
  // Stacked layers — for product Variations (distinct from the Categories tag).
  variations: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  customers: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM2 20c0-3.3 4-5 8-5s8 1.7 8 5',
  suppliers: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1',
  purchases: 'M4 4h2l1.4 10.6a2 2 0 002 1.4h7.6a2 2 0 002-1.7L20 8H6M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z',
  inventory: 'M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 7v10l9 4 9-4V7',
  // Crate with a separate lid — for Kits & Bundles (distinct from the open
  // "products" box and the stacked "inventory" boxes).
  kits: 'M21 8H3v13h18V8zM1 3h22v5H1V3zM10 12h4',
  // Warehouse/building — for the Warehouses module (distinct from Inventory).
  warehouses: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6',
  pos: 'M2 9h20M4 6h16a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zM7 14h2m3 0h5',
  sales: 'M4 4h16v4H4V4zm2 4v12h12V8M9 12h6M9 16h6',
  reports: 'M4 20V10m6 10V4m6 16v-7',
  search: 'M21 21l-4.35-4.35m1.35-5.15a7 7 0 11-14 0 7 7 0 0114 0z',
  bell: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m0-9H5a2 2 0 00-2 2v14a2 2 0 002 2h2',
  chevronDown: 'M6 9l6 6 6-6',
  plus: 'M12 4v16m8-8H4',
  trash: 'M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 0l1 12a1 1 0 001 1h6a1 1 0 001-1l1-12',
  edit: 'M11 4h6a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2v-6M15.5 4.5l4 4L11 17l-4.5 1 1-4.5 8-9z',
  close: 'M6 18L18 6M6 6l12 12',
  users: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-9.13a4 4 0 110 8 4 4 0 010-8zm7 5a4 4 0 10-1-7.87',
  chat: 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z',
  barcode: 'M3 5v14M7 5v14M11 5v14M13 5v14M17 5v14M21 5v14M5 5v0M9 5v0',
  chart: 'M3 3v18h18M8 17V9m4 8V5m4 12v-5',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  // Login form additions.
  mail: 'M3 5h18v14H3V5zm0 0l9 7 9-7',
  lock: 'M6 11V7a6 6 0 1112 0v4M5 11h14v10H5V11z',
  eye: 'M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z M12 15a3 3 0 100-6 3 3 0 000 6z',
  eyeOff:
    'M3 3l18 18M10.6 10.6a3 3 0 004.24 4.24M9.5 4.18A10.94 10.94 0 0112 4c6.5 0 10.5 7 10.5 7a13.16 13.16 0 01-3.13 3.94M6.6 6.6C3.4 8.6 1.5 12 1.5 12s1.6 2.8 4.44 4.9',
  // Appearance module — theme toggle in the navbar / Settings page.
  sun: 'M12 3v2m0 14v2m9-9h-2M5 12H3m15.4 6.4l-1.4-1.4M7 7L5.6 5.6m12.8 0L17 7M7 17l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  settings: 'M10.3 3.4a2 2 0 013.4 0l.3.5a2 2 0 002.3.9l.5-.2a2 2 0 012.6 2.6l-.2.5a2 2 0 00.9 2.3l.5.3a2 2 0 010 3.4l-.5.3a2 2 0 00-.9 2.3l.2.5a2 2 0 01-2.6 2.6l-.5-.2a2 2 0 00-2.3.9l-.3.5a2 2 0 01-3.4 0l-.3-.5a2 2 0 00-2.3-.9l-.5.2a2 2 0 01-2.6-2.6l.2-.5a2 2 0 00-.9-2.3l-.5-.3a2 2 0 010-3.4l.5-.3a2 2 0 00.9-2.3l-.2-.5a2 2 0 012.6-2.6l.5.2a2 2 0 002.3-.9z M12 15a3 3 0 100-6 3 3 0 000 6z',
  calendar: 'M8 2v4m8-4v4M3 10h18M5 6h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z',
  creditCard: 'M2 8h20M4 5h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2zM6 15h4',
  upload: 'M12 16V4m0 0L7 9m5-5l5 5M4 20h16',
  download: 'M12 4v12m0 0l-5-5m5 5l5-5M4 20h16',
  checkCircle: 'M12 22a10 10 0 100-20 10 10 0 000 20zM8 12l3 3 5-6',
  key: 'M15 7a4 4 0 11-4 4 4 4 0 014-4zM11 11L3 19v2h2l8-8',
  userCircle: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0',
  // Banknote — Payroll module, distinct from creditCard (Customer Credit).
  payroll: 'M2 6h20v12H2V6zm10 3a3 3 0 100 6 3 3 0 000-6zM5 12h.01M19 12h.01',
  // Wallet with a note peeking out — Staff Expense Management. Distinct
  // from creditCard (Customer Credit) and payroll (Banknote): this one
  // reads as "money going out of a personal pouch" rather than a card
  // or a stack of bills.
  expenses: 'M3 7a2 2 0 012-2h11a2 2 0 012 2v1h1a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm2 0v3h13V7a1 1 0 00-1-1H6a1 1 0 00-1 1zm12 6a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  // --- Product Search view-switcher (ProductSearchGrid) ---------------
  // Card view: one large hero tile plus two smaller tiles below — reads
  // as the roomiest, most "card-like" of the three layouts.
  viewCard: 'M3 3h18v8H3V3zm0 10h8v8H3v-8zm10 0h8v8h-8v-8z',
  // Grid view: an even 3x3 field of small tiles — the densest tile layout.
  viewGrid:
    'M3 3h5v5H3V3zm7 0h5v5h-5V3zm7 0h5v5h-5V3zM3 10h5v5H3v-5zm7 0h5v5h-5v-5zm7 0h5v5h-5v-5zM3 17h5v5H3v-5zm7 0h5v5h-5v-5zm7 0h5v5h-5v-5z',
  // List view: a stack of small square bullets each paired with a row line.
  viewList: 'M3 5h4v4H3V5zm7 1h11M3 11h4v4H3v-4zm7 1h11M3 17h4v4H3v-4zm7 1h11',
}

export default function Icon({ name, className = 'h-5 w-5' }) {
  const d = paths[name]
  if (!d) return null
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}