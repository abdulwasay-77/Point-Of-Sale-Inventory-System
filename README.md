# POS & Inventory System
A full-stack, multi-tenant SaaS Point of Sale & Inventory Management System.

Backend: Express 5 + Prisma 5 + PostgreSQL, JWT auth, granular role/permission system, multi-business (multi-tenant) data isolation.

Frontend: React 19 + Vite + Tailwind CSS, React Router, Recharts.

```
pos-inventory-system/
├── backend/     Express API (Prisma ORM, JWT auth, PostgreSQL)
└── frontend/    React app (Vite, Tailwind, React Router)
```

## Table of Contents
- [Architecture overview](#architecture-overview)
- [Feature list](#feature-list)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Environment variables](#environment-variables)
- [Getting started](#getting-started)
  - [Option A — Quick start with demo data (seed.js)](#option-a--quick-start-with-demo-data-seedjs)
  - [Option B — Clean start without seed.js (recommended for production/real use)](#option-b--clean-start-without-seedjs-recommended-for-productionreal-use)
- [Frontend setup](#frontend-setup)
- [Customizing seed data with AI](#customizing-seed-data-with-ai)
- [Platform (Super Admin) workflow](#platform-super-admin-workflow)
- [Roles & permissions](#roles--permissions)
- [Module gating (per-business feature flags)](#module-gating-per-business-feature-flags)
- [Useful backend scripts](#useful-backend-scripts)
- [Project structure](#project-structure)
- [Notes & known simplifications](#notes--known-simplifications)

## Architecture overview
This app is multi-tenant: many separate businesses ("tenants") can run on one deployment, each with its own users, products, sales, etc., completely isolated from one another.

**Platform layer** — PlatformAdmin / Business / PlatformAuditLog. Managed only through `/api/platform/*` routes, authenticated with a completely separate JWT token type (`platformAuthMiddleware.js`) that is never accepted by the normal tenant routes, and vice versa. A Super Admin (Platform Admin) creates and manages businesses, suspends/activates them, resets a business's admin password, and turns feature modules on/off per business.

**Tenant layer** — every other model (User, Product, Invoice, Customer, ...) belongs to exactly one Business via `business_id`. Data isolation is enforced automatically by a tenant-scoping Prisma extension (`backend/src/config/db.js`) that injects `business_id` into every query for a tenant model, based on the logged-in user's business (set once per request in `authMiddleware.js` via Node's `AsyncLocalStorage`). Individual service files never need to remember to filter by `business_id` manually.

Roles are fully dynamic — there are no hardcoded built-in roles. An admin creates roles from scratch (Users & Roles → Manage Roles) and assigns permissions from a fixed catalog (`backend/src/config/permissions.js`). Each business's first user (the primary admin) has `is_primary_admin=true` and bypasses the role system entirely with full access — this account can't be edited, deactivated, or locked out by anyone else, guaranteeing a business is never left without someone who can manage its own staff.

**Module gating** — independently of roles, a Super Admin can enable/disable entire feature modules (Payroll, Kits, Installments, etc.) per business (`Business.enabled_modules`). This is checked before the role/permission system — a disabled module is invisible and unreachable regardless of any user's role.

## Feature list

### Catalog & inventory
- **Products** — SKU, barcode, category, brand, base unit of measure (BOX / SQ_FT / SQ_M / LENGTH / BUNDLE / PIECE), retail/wholesale/cost pricing, GST rate, standing discount, target margin, HSN code, reorder threshold, product images (upload).
- **Categories** — simple CRUD, used to organize products and drive the "Sales by Category" report.
- **Variations** — reusable, catalog-wide attributes (e.g. Color, Diameter) with per-value price adjustments; products attach a variation and stock is tracked per variant value, never as one colorless pool.
- **Batch & lot tracking** — batch-tracked products (e.g. tiles, where shade/lot consistency matters) require a batch number (+ optional shade code) at purchase time; POS offers a batch picker so a whole order can be filled from one consistent lot.
- **Costing (FIFO)** — every purchase opens its own cost lot instead of averaging into the existing cost; sales draw cost from the oldest lot first (FIFO), not a running average.
- **Kits & bundles** — a kit is priced as a single line at checkout; the backend deducts each component product from stock individually and validates availability across all components before committing.
- **Flexible UoM / Area-to-box calculator** — products can carry a `coveragePerBox` (sq ft per box); POS offers an area calculator that takes floor dimensions + a waste margin and rounds up to the nearest whole box.
- **Barcode scanning** — any USB/Bluetooth barcode scanner works out of the box (scanners act as keyboards). Active on the POS page (scan → add to cart) and the product form (scan → fill barcode field). Looks up by barcode first, falls back to SKU.
- **Barcode label generation & printing** — dedicated Barcode Labels page.
- **Multi-warehouse inventory** — named warehouses/locations, per-warehouse stock levels, and atomic stock transfers between locations (decrement source / increment destination in one transaction).

### Sales & customers
- **Point of Sale (POS)** — cart-based checkout, product search grid, barcode scanning, per-product default discount applied automatically (overridable per line at sale time), automatic wholesale pricing for WHOLESALE/CONTRACTOR customers, multiple payment methods (Cash, Card, UPI, Bank Transfer, Credit).
- **Invoices** — generated on checkout, printable/PDF receipts (`InvoiceReceipt.jsx`, `PaymentReceipt.jsx`), void/reversal support with automatic stock reversal.
- **Customers** — retail/wholesale/contractor types, credit limits, GSTIN, purchase history per customer.
- **Customer credit** — outstanding balances, due dates, late fees, dedicated Credit management page.
- **Installment plans** — schedule-based installment billing with individual installment payments trackable and markable as paid.
- **Suppliers & supplier ledgers** — running balance per supplier, 0-30/31-60/61-90/90+ day aging breakdown of unpaid purchases, full entry history, and a form to record payments against the balance.
- **Purchases (Purchase Orders)** — record purchases against a supplier, target a specific receiving warehouse, and open FIFO cost lots automatically.

### Staff & operations
- **Payroll** — employee records linked to users, payroll records, and automatic sales commission calculation for staff with a linked employee `commission_rate`.
- **Staff expenses** — staff can record their own expenses (`EXPENSES_RECORD`); admins manage budgets, per-staff spending limits, void entries, and view full history (`EXPENSES_MANAGE`).
- **Users & Roles** — fully dynamic role creation/editing/deletion, per-user permission overrides on top of role defaults (only the exceptions are stored), user activation/deactivation.
- **Profile** — per-user avatar, contact info, theme preference (light/dark).
- **Business Settings** — business info, defaults, logo upload, and a full data backup export (Excel and PDF) of every record currently in the system (passwords excluded).

### Reporting & dashboard
- **Dashboard** — key stats, recent sales, low-stock list, sales chart.
- **Reports** (viewable in-app and exportable as PDF/Excel):
  - Daily Sales
  - Sales by Product
  - Sales by Category
  - Sales by Variation
  - Expenses
  - Invoices
  - Stock Report
  - Low Stock Report
  - Customer Summary

### AI chatbot (rule-based, staff-only)
Floating widget on every page, backed by a single endpoint (`POST /api/chatbot/message`). Not an LLM — a regex-based intent matcher (`backend/src/modules/chatbot/chatbot.service.js`) running against live data (fuzzy-matched product/customer/supplier names). Covers:
- Stock levels, low-stock lookups, prices, product/customer/supplier lookups
- Today's / this month's sales, dashboard summary
- "How do I…" guidance for common tasks (add a product, record a purchase, checkout, add a customer)
- **Actions** — can adjust stock, record a purchase, or add a customer, but always proposes the exact action first and only executes after an explicit "yes". Gated by the `CHATBOT_ACTIONS` permission plus the normal permission for that action (e.g. `PURCHASES_CREATE`).

### Multi-currency display
Amounts are stored and entered in PKR; a currency switcher in the navbar (PKR/USD/EUR/GBP/AED/SAR) converts for display only, using fixed rate snapshots (`frontend/src/utils/currency.js`).

### Platform / Super Admin (multi-tenant management)
- Separate login and dashboard (`/platform`) for Super Admins.
- Create a business (auto-generates a unique slug + its first primary admin user in one transaction).
- Suspend / activate / set trial status per business.
- Enable/disable feature modules per business.
- Set a max admin-seat limit per business.
- Reset a business's primary admin password (support action, no need to know the old password).
- Update business info (name, industry, contact details).
- Platform audit log of all the above actions.

## Tech stack

**Backend**
- Node.js, Express 5
- Prisma 5 ORM + PostgreSQL
- JWT (`jsonwebtoken`) authentication, `bcryptjs` password hashing
- `multer` (file uploads), `pdfkit` (PDF generation), `exceljs` (Excel export)
- `nodemon` for local dev

**Frontend**
- React 19, Vite 6
- Tailwind CSS 3
- React Router 6
- `axios`, `recharts`, `jsbarcode`, `jspdf`

## Prerequisites
- Node.js (LTS recommended)
- PostgreSQL (running instance you can connect to)
- npm

## Environment variables

### `backend/.env`
```env
# PostgreSQL connection string
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/pos_inventory_db"

# Secret used to sign JWTs — required, no default. The server refuses to
# start without this set (see backend/src/config/env.js).
JWT_SECRET="change-this-to-a-long-random-string"

# Optional — defaults shown
JWT_EXPIRES_IN=24h
PORT=5000
UPLOAD_DIR=uploads
NODE_ENV=development
```

### `frontend/.env`
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

## Getting started

### 1. Install dependencies
```bash
cd backend
npm install
npx prisma generate
```
`npx prisma generate` / `migrate` need to download Prisma's query engine binary the first time — make sure you're not on a network that blocks that.

Apply the database schema:
```bash
npx prisma migrate deploy
# or, for a local/dev database:
npx prisma migrate dev
```

From here you have two ways to get your first login, depending on whether you want demo data or a clean production-style start.

### Option A — Quick start with demo data (seed.js)
Fastest way to get a fully populated business to explore the UI (categories, variations, products, customers, suppliers — see `backend/prisma/seed.js`).

1. Open `backend/prisma/seed.js` and replace every `CHANGEME` placeholder — the demo Business (name/slug/industry/contact email) and the `PRIMARY_ADMIN` block (name/email/password) — with real values.
2. Run:
```bash
cd backend
npx prisma migrate reset   # applies migrations + runs the seed automatically
# or, if your database already has the schema applied:
npm run prisma:seed
npm run dev
```
3. Log in to the app with the `PRIMARY_ADMIN` email/password you set in step 1. That account is the business's primary admin — use Users & Roles inside the app to create real roles and staff from there.

### Option B — Clean start without seed.js (recommended for production/real use)
This path never touches demo/dummy data. It uses the platform (Super Admin) layer to create your real business the same way a live deployment would.

**Step 1 — Apply migrations (no seed):**
```bash
cd backend
npx prisma migrate deploy
# or for local/dev:
npx prisma migrate dev
```

**Step 2 — Create your Super Admin (platform-level) login:**

Open `backend/create-platform-admin.js` and replace the `NAME`, `EMAIL`, and `PASSWORD` placeholders with real values, then run it once:
```bash
node create-platform-admin.js
```
You can safely leave this file in the repo — running it again just fails harmlessly on the unique email constraint — or delete it after use.

**Step 3 — Start the backend:**
```bash
npm run dev
# or in production:
npm start
```

**Step 4 — Create your real business:**

1. Start the frontend (see below) and go to the Platform login (`/platform`).
2. Log in with the Super Admin credentials from Step 2.
3. From the Platform Dashboard, create a new business — this generates a unique slug and creates that business's primary admin user in the same transaction (no manual SQL, no seed script involved). Alternatively, call the API directly:
```bash
curl -X POST http://localhost:5000/api/platform/businesses \
  -H "Authorization: Bearer <platform_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Business Name",
    "industryType": "Retail",
    "contactEmail": "owner@yourbusiness.com",
    "adminName": "Owner Name",
    "adminEmail": "owner@yourbusiness.com",
    "adminPassword": "a-strong-password"
  }'
```
4. Log out of the platform dashboard and log in to the normal app (`/login`) with the business admin credentials from step 4.3. From there, use Users & Roles to build out real roles and staff — the business starts on a completely blank slate (no built-in roles, no demo data).

## Frontend setup
```bash
cd frontend
npm install
npm run dev
```
- Frontend runs on http://localhost:5173 (Vite default).
- Talks to the backend at the URL in `frontend/.env` (`VITE_API_BASE_URL`, defaults to `http://localhost:5000/api`).

Build for production:
```bash
npm run build
npm run preview
```

## Customizing seed data with AI
The `backend/prisma/seed.js` file is designed to be easily customizable with AI assistance. All seed data is clearly marked with `CHANGEME` placeholders, making it simple to generate realistic test data for any business scenario.

### How to customize with AI
1. Copy the `seed.js` file and paste it into any AI chat tool (ChatGPT, Claude, etc.)
2. Provide your requirements — tell the AI what kind of business you're testing (e.g., "electronics store", "pharmacy", "construction materials", etc.)
3. Get back a customized file with all `CHANGEME` values replaced with realistic data for your use case
4. Replace the original `seed.js` with the AI-generated version
5. Run the seed as described in Option A above

### Example prompts
- "Replace all CHANGEME values in this seed.js with realistic data for a computer hardware store — include PCs, peripherals, components, etc."
- "Generate seed data for a pharmaceutical wholesale business with medicines, medical supplies, and healthcare products."
- "Create seed data for a restaurant supply company with kitchen equipment, utensils, and food service items."
- "Populate this seed with test data for a fashion boutique — clothing, accessories, footwear with sizes and colors as variations."

The AI will understand the structure and generate appropriate:
- Business details (name, industry, contact info)
- Categories that match your industry
- Products with realistic names, SKUs, prices, and stock levels
- Variations (colors, sizes, materials, etc.)
- Customers and suppliers with realistic names and contact details
- Kits and bundles that make sense for your business type

All while preserving the exact structure and relationships required by the system — so the seeded data works flawlessly out of the box.

## Platform (Super Admin) workflow

| Endpoint | Purpose |
|---|---|
| `POST /api/platform/auth/login` | Super Admin login |
| `GET /api/platform/auth/me` | Current platform admin info |
| `GET /api/platform/businesses` | List all businesses |
| `GET /api/platform/businesses/:id` | Get one business |
| `POST /api/platform/businesses` | Create a business (+ its primary admin) |
| `PATCH /api/platform/businesses/:id` | Update business info |
| `PATCH /api/platform/businesses/:id/status` | Set status: TRIAL / ACTIVE / SUSPENDED |
| `PATCH /api/platform/businesses/:id/modules` | Set which feature modules are enabled |
| `PATCH /api/platform/businesses/:id/admin-seats` | Set max admin seats |
| `POST /api/platform/businesses/:id/reset-admin-password` | Reset that business's primary admin password |

Platform routes use a completely separate JWT token type from normal tenant users — a platform token is rejected by tenant routes and a tenant token is rejected by platform routes.

## Roles & permissions
- Roles are fully dynamic — created, renamed, re-permissioned, and deleted through Users & Roles → Manage Roles. A brand-new role starts with zero permissions.
- Permissions are granted from a fixed catalog (`backend/src/config/permissions.js`), grouped by module (Products, Inventory, Contacts, Sales, Admin, Expenses, ...).
- A user's effective permissions = their role's permission set + any per-user overrides (Users & Roles → a user → Permissions). Only the exceptions are stored, so most users just inherit their role's defaults.
- The primary admin account (one per business, created at business setup) bypasses the role system entirely and always has full access. It can't be edited, deactivated, or have its permissions overridden by anyone else — this guarantees a business is never left without someone who can manage its own staff and roles.

## Module gating (per-business feature flags)
Independent of roles, a Super Admin controls which feature modules exist for a business at all (`Business.enabled_modules`, checked before any permission check):

`PRODUCTS, INVENTORY, CONTACTS, SALES, PURCHASES, REPORTS, PAYROLL, EXPENSES, CREDIT, INSTALLMENTS, KITS, ADMIN`

A new business defaults to: `PRODUCTS, INVENTORY, CONTACTS, SALES, PURCHASES, REPORTS, ADMIN`. See `backend/src/config/modules.js`.

## Useful backend scripts
```bash
npm run dev             # start with nodemon (auto-restart)
npm start                # start normally
npm run prisma:generate  # regenerate Prisma client
npm run prisma:migrate   # prisma migrate dev
npm run prisma:studio    # open Prisma Studio (DB browser)
npm run prisma:seed      # run prisma/seed.js manually
node create-platform-admin.js         # create a Super Admin login (edit placeholders first)
node scripts/validate-schema.js prisma/schema.prisma   # validate schema.prisma without needing Prisma engine binaries
```

## Project structure
```
backend/
├── create-platform-admin.js     One-off script: create a Super Admin login
├── prisma/
│   ├── schema.prisma             Full DB schema (multi-tenant, 27+ models)
│   ├── seed.js                   Demo business + demo data (optional)
│   └── migrations/                Migration history
├── scripts/
│   └── validate-schema.js        Standalone schema validator (no engine binaries needed)
├── uploads/                       Product/avatar/business images (local disk)
└── src/
    ├── app.js / server.js
    ├── config/                    db (tenant-scoping Prisma extension), env, modules, permissions
    ├── middleware/                auth, platform auth, permissions, roles, upload, error handling
    ├── modules/                   auth, categories, chatbot, credit, customers, dashboard, expenses,
    │                              installments, inventory, kits, payroll, platform (business + platform auth),
    │                              products, profile, purchases, reports, roles, sales, settings,
    │                              suppliers, transfers, users, variations, warehouses
    └── utils/                     shared helpers (api responses, PDF tables, ledgers, permissions, etc.)

frontend/
└── src/
    ├── components/                chatbot, common, dashboard, layout, pos, products, sales
    ├── context/                   Auth, BusinessSettings, Cart, Currency, Theme
    ├── hooks/                     auth, barcode scanner, cart, currency, permissions, theme, etc.
    ├── layouts/                   AuthLayout, DashboardLayout
    ├── pages/                     one folder per feature area (matches backend modules), plus platform/
    ├── routes/                    ProtectedRoute, PlatformProtectedRoute
    ├── services/                  one axios-based service per backend module
    └── utils/                     currency, formatters, receipt PDF, etc.
```

## Notes & known simplifications
- Product/avatar/business images are stored on local disk under `backend/uploads/` and served statically — fine for development, but you'll want cloud storage (S3, etc.) before deploying anywhere with an ephemeral filesystem.
- CORS is wide open (`app.use(cors())`) — tighten this to your actual frontend origin before deploying.
- Currency conversion uses fixed rate snapshots, not a live FX API (`frontend/src/utils/currency.js`).
- `Business.slug` is not yet used for real subdomain-based tenant routing (single-deployment stage) — kept for display/reference so that can be added later without a schema change.
- Kit components are deducted from whichever stock level has the most quantity — batch selection isn't threaded through kit components individually yet.