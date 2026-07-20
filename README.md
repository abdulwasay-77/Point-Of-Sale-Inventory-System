
# POS & Inventory System

Full-stack app: **Express 5 + Prisma 5 + PostgreSQL** backend, **React 19 + Vite + Tailwind** frontend.
This zip contains both halves in one folder structure, wired together and ready to run.

```
project/
├── backend/     Express API (Prisma ORM, JWT auth, PostgreSQL)
└── frontend/    React app (Vite, Tailwind, React Router)
```

## What was done to integrate the two

The frontend (from your partner) was a complete UI already calling a clean, predictable REST
contract via axios services in `frontend/src/services/`. The backend only had the `auth` module
implemented — every other module (`products`, `customers`, `suppliers`, `inventory`, `sales`,
`payroll`) existed as empty placeholder files, and there was no `categories`, `purchases`, or
`dashboard` module at all.

What changed:

- **Backend**: built out every module (routes/controller/service) against the existing Prisma
  schema, matching the exact endpoints the frontend already expects. Added `categories`,
  `purchases`, and `dashboard` modules from scratch. Added image upload (`multer`, saved to
  `backend/uploads/products`, served at `/uploads/...`). Added two small schema fields
  (`Product.image_url`, `Customer.address`, `Supplier.address`) with a follow-up migration.
- **Frontend**: every page that used `utils/mockData.js` was rewired to call the real services
  (fetch on load, create/update/delete against the API, then refresh). The login page's fake
  role-picker was removed since the real role now comes back from the server. `mockData.js` was
  deleted since nothing references it anymore.

### Simplifications worth knowing about

The Prisma schema supports multi-warehouse inventory, batch tracking, and product kits — but the
frontend UI has no concept of any of that. To keep the two sides consistent without redesigning
the UI:

- All stock is tracked against a single **default warehouse** (auto-created as "Main Store" on
  first use, or reuses the one from `prisma/seed.js`).
- POS checkout doesn't do batch selection — it just decrements the product's total stock.
- Sales commission is calculated automatically if the logged-in user has a linked `Employee`
  record with a `commission_rate` (seed data doesn't set one up by default).
- The `payroll` module has a working backend (was already scaffolded, and the schema supports
  it per the SRS) but there's no frontend page for it — the partner's UI never included one.

## Setup

### 1. Backend

```bash
cd backend
npm install
npx prisma generate
```

Edit `.env` (already present) if your PostgreSQL credentials differ from what's there, then:

```bash
npx prisma migrate dev
npm run prisma:seed
npm run dev
```

Backend runs on **http://localhost:5000**. Seed accounts:
- `admin@pos.com` / `admin123` (ADMIN)
- `staff@pos.com` / `staff123` (SALES_STAFF)

> Note: `npx prisma generate` / `migrate` need to download Prisma's query engine binary from
> the internet the first time — make sure you're not on a restricted network for that step.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on **http://localhost:5173** (Vite default) and talks to the backend at the URL
in `frontend/.env` (`VITE_API_BASE_URL`, defaults to `http://localhost:5000/api`).

## Notes

- Product images are stored on local disk under `backend/uploads/products/` and served
  statically — fine for development, but you'll want cloud storage (S3, etc.) before deploying
  anywhere with an ephemeral filesystem.
- CORS is wide open (`app.use(cors())`) — tighten this to your actual frontend origin before
  deploying.
- The currency formatter supports switching between PKR/USD/EUR/GBP/AED/SAR from the navbar
  (see `frontend/src/utils/currency.js`); rates are fixed snapshots, not live.

## Role Management (granular permissions)

Roles (`ADMIN`, `ACCOUNTANT`, `SALES_STAFF`, `WAREHOUSE_STAFF`) still exist and set each user's
*default* permission set — see `backend/src/config/permissions.js` for the full list and
defaults. On top of that, an admin can grant or revoke individual permissions per user from
**Users & Roles** (admin-only page) → **Permissions** on any user. Only the exceptions are
stored (`user_permissions` table), so most users just inherit their role's defaults.

Every existing route that used to check a hardcoded role list now checks a permission instead
(`permissionMiddleware`, replacing the old `roleMiddleware`) — e.g. deleting a product needs
`PRODUCTS_DELETE`, not literally `role === 'ADMIN'`. This means the specific people who can do
what is now fully configurable without touching code.

One simplification: the sidebar still hides Suppliers/Reports/Users from non-admins based on
`role === 'ADMIN'`, not the granular permission set. If you grant a non-admin one of those
permissions via an override, the backend will correctly allow them through, but they'd need to
be given the direct URL — the nav link won't appear for them. Worth revisiting if you lean on
overrides heavily.

## Barcode scanner

No special hardware integration needed — USB/Bluetooth barcode scanners act as keyboards (HID
devices), so a scan is just very fast typing followed by Enter. `frontend/src/hooks/
useBarcodeScanner.js` listens for that pattern (keystrokes under ~40ms apart, 4+ characters,
then Enter) and treats it as a scan — this works with any scanner without hardware-specific
code, and you can test the exact same code path today by typing a barcode fast and hitting
Enter.

- Active on the POS page — scanning adds the matched product straight to the cart.
- Also active in the product Add/Edit form — scanning fills the Barcode field, so you can
  onboard a new product by scanning its label once instead of typing the number.
- Products got a new optional `barcode` field, separate from `sku`. Scanning looks up by
  barcode first, falling back to SKU if no barcode is set for that product
  (`GET /api/products/lookup/:code`).

## AI chatbot (rule-based, staff-only)

Floating widget in the bottom-right corner on every page (see `frontend/src/components/
chatbot/ChatWidget.jsx`), talking to a single endpoint: `POST /api/chatbot/message`.

It's rule-based, not an LLM — see `backend/src/modules/chatbot/chatbot.service.js` for the
full intent list. It covers stock levels, low stock, prices, product/customer/supplier lookups,
today's/monthly sales, dashboard summary, and how-to questions, all matched against **live**
data (fuzzy-matched product/customer/supplier names, not hardcoded). Any question it can't
match gets an honest "I didn't catch that" rather than a guess.

It can also *do* a few things — adjust stock, record a purchase, add a customer — but always
proposes the exact action first and only executes after you reply "yes". These actions require
the `CHATBOT_ACTIONS` permission (only `ADMIN` has it by default; grant it to specific users via
Users & Roles → Permissions if you want others to use it) *plus* the normal permission for that
action (e.g. `PURCHASES_CREATE`). This two-layer check is deliberate — it's the main thing
keeping "the bot must perform actions but not break the site" honest.

To extend it, add a new entry to `getIntents()` in `chatbot.service.js` — a regex pattern plus
a handler. No model, no training data, no API key required.

## Domain-requirement validation pass (this round)

A gap audit against the original project brief found 7 requirements that existed only as
unused Prisma schema (or were fully missing), despite the schema itself already modeling them
correctly. All 7 are now implemented end-to-end (backend logic + frontend UI), no schema
changes or migrations required — the models were already there, they just weren't wired up.

1. **Batch & Lot Tracking** — Purchases now require a batch number (+ optional shade code) for
   any batch-tracked product, creating a real `Batch` row instead of pooling stock anonymously.
   POS shows a batch picker for these products so a whole order can be filled from one
   consistent shade/lot (`BatchSelectorModal.jsx`).
2. **Flexible UoM Conversion / Area-to-Box Calculator** — Products can carry a
   `coveragePerBox` (sq ft per box). POS gets an "Area calculator" shortcut on those products —
   enter floor dimensions + a 10-15% waste margin, it rounds up to the nearest whole box
   (`AreaToBoxModal.jsx`). `conversionFactor` is also exposed on the product form for
   LENGTH/BUNDLE items.
3. **Kitting & Bundling** — New `/kits` module (backend CRUD + `KitsPage.jsx`). A kit is priced
   as one line at checkout; the backend deducts each component product from stock individually,
   validating availability across all components before committing.
4. **Wholesale/Contractor Billing** — Checkout now automatically applies `wholesale_price`
   instead of `retail_price` when the selected customer's type is `WHOLESALE` or `CONTRACTOR` —
   no manual toggle needed.
5. **Supplier Ledgers** — Suppliers page now has a **Ledger** view per supplier: running
   balance, a 0-30/31-60/61-90/90+ day aging breakdown of unpaid purchases, full entry history,
   and a form to record a payment against the balance.
6. **Multi-location Warehouse Management** — New `/warehouses` page (Locations + Stock
   Transfers tabs). Purchases can now target a specific receiving warehouse; stock transfers
   move inventory between locations atomically (decrement source, increment destination, one
   transaction).
7. **Employee Payroll** — was already solid on the backend; no changes needed here.

One thing to flag honestly: kit components are deducted from whichever stock level has the most
quantity, the same simplification as regular non-batch-tracked sales — batch selection isn't
threaded through kit components individually. If a kitted component is itself batch-tracked and
shade-consistency matters for it too, that's a follow-up, not something this pass covers.

`prisma/seed.js` was updated to include a second warehouse and 2 demo kits so these new pages
aren't empty on first run — run `npx prisma migrate reset` to pick up the new seed data (see
below); this only affects seed data, not your schema.
