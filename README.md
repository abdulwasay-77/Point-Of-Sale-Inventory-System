# General-Purpose Point Of Sale Inventory System

A full-stack, multi-tenant **general-purpose Point Of Sale (POS) Inventory System** for retail, wholesale, distribution, and service businesses. It supports the day-to-day flow from configuring a business and catalog, through purchasing and stock control, to POS checkout, customer balances, reporting, and administration.

It is intentionally not tied to one industry. A business can define its own categories, units of measure, variations, warehouses, customers, suppliers, prices, staff roles, and enabled features.

## Contents

- [What the system does](#what-the-system-does)
- [Architecture](#architecture)
- [Complete business flow](#complete-business-flow)
- [Features](#features)
- [Access control and tenancy](#access-control-and-tenancy)
- [Technology](#technology)
- [Requirements](#requirements)
- [Installation and local startup](#installation-and-local-startup)
- [Environment variables](#environment-variables)
- [First-time onboarding](#first-time-onboarding)
- [Frontend routes](#frontend-routes)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Project structure](#project-structure)
- [Scripts and verification](#scripts-and-verification)
- [Operational notes](#operational-notes)

## What the system does

The application manages the full commercial loop:

1. A platform administrator creates a separate business tenant and its first business administrator.
2. The business administrator configures branding, users, roles, units, categories, warehouses, products, suppliers, and customers.
3. Staff record purchases into a warehouse. This increases available stock, creates batch/lot records when required, and opens FIFO cost lots.
4. Staff sell products, variants, batches, or kits from the POS. Checkout creates an invoice, records payment, deducts stock, consumes cost lots FIFO, and can create credit or installment obligations.
5. Managers monitor inventory, stock movements, sales, customer/supplier ledgers, payroll, expenses, dashboards, and downloadable reports.

## Architecture

```text
React 19 + Vite + Tailwind (frontend, normally http://localhost:5173)
                    |
                    | HTTP / JSON, Bearer JWT
                    v
Express 5 REST API (backend, normally http://localhost:5000)
                    |
                    | Prisma ORM with request-scoped tenant context
                    v
PostgreSQL
```

The repository contains two independently runnable applications:

```text
pos-inventory-system/
├── backend/                 Express API, Prisma schema and migrations
└── frontend/                React single-page application
```

Uploaded product images, profile avatars, and business logos are stored under `backend/uploads/` and served by the API at `/uploads/...`. The folder is intentionally ignored by Git.

### Multi-tenant design

Each ordinary business record belongs to a `Business` through `business_id`. The backend establishes the authenticated user's business in Node.js `AsyncLocalStorage`; a Prisma extension automatically adds that tenant scope to reads, writes, aggregates, and deletes for tenant-owned models. A platform administrator and platform audit logs are deliberately outside this tenant scope.

Tenant and platform sessions use separate JWT types. A platform token is rejected by business routes, and a business token is rejected by platform routes. Suspended businesses are blocked on the next authenticated request.

## Complete business flow

### 1. Platform administration and business creation

Use `/platform/login` to sign in as a platform administrator. From the platform dashboard, create a business with its identity/contact information and first primary-admin account. The business receives the default core modules: Products, Inventory, Contacts, POS & Invoices, Purchases, Reports & Dashboard, and Administration.

The platform administrator can then:

- view businesses and business details;
- activate, suspend, or mark a business as trial;
- enable or disable modules per business;
- set the maximum number of admin seats;
- update business information; and
- reset the business primary administrator's password.

### 2. Business administration and setup

Sign in at `/login` with the business primary-admin account. This account has full access and cannot be deactivated or locked out by a normal business user.

Set up the business in this recommended order:

1. Open **Settings** and enter company name, logo, address, phone, tax ID, currency symbol, invoice prefix/footer, default tax rate, low-stock settings, credit alerts, session timeout, and installment minimum down-payment percentage.
2. Add **Units of Measure**, such as Piece, Box, Kilogram, Litre, Meter, Dozen, Square Foot, or any organization-specific unit. Units are configurable, not fixed to a particular industry.
3. Add **Categories** and optional reusable **Variations** such as Colour, Size, Grade, or Diameter. Each variation can have reusable values and price adjustments.
4. Create at least one active **Warehouse**. The app uses a default warehouse where necessary.
5. Add **Suppliers** and **Customers**. Customers can be retail, wholesale, or contractor accounts and may include GSTIN, credit limit, and contact information.
6. Create dynamic **Roles** and assign only the permissions required. Then add staff users and optional per-user permission overrides.
7. Add products and, when applicable, kits/bundles.

### 3. Product and inventory setup

A product can include SKU, barcode, product image, category, brand, base unit of measure, retail/wholesale/cost pricing, GST rate, standing discount, target margin, HSN code, reorder level, and product-specific inventory rules.

Products may use the following additional structures:

- **Variants:** stock and pricing can be managed by selected variation values rather than only at the parent-product level.
- **Batches/lots:** batch-tracked products require a batch number at receiving. Optional shade codes support products where matching the lot matters.
- **Area coverage:** for box-based coverage products, store coverage per box. At POS, the area calculator accepts dimensions and waste percentage, then rounds to a whole-box quantity.
- **Kits:** sell one kit line while inventory is deducted for every component product. Availability is validated before the sale is committed.
- **Barcode labels:** generate barcode values and print labels from the dedicated barcode page.

### 4. Purchasing and receiving stock

Create a purchase against a supplier and receiving warehouse, including product quantities and unit costs. When stock is received, the system records the purchase order and related stock movement, increases the destination warehouse stock, updates the supplier ledger, and creates FIFO cost lots. Batch-tracked items capture batch information during this process.

Supplier payments can be recorded separately. Supplier ledger entries preserve the running balance and support aging-style review of unpaid purchasing activity.

### 5. Warehouse control and transfers

Inventory is held per warehouse through stock-level records. Create warehouses/locations as needed and use stock transfers to move items between them. A transfer atomically decreases stock at the source and increases stock at the destination; transfer history provides an audit trail.

The Inventory page provides available stock and low-stock views. Reorder thresholds on products drive low-stock monitoring and dashboard/report output.

### 6. Point of Sale checkout

Open **POS** and find products through search, SKU/barcode lookup, or a keyboard-mode USB/Bluetooth barcode scanner. Add a product, variant, selected batch, or kit to the cart. The cart supports line-level quantity and discount changes; default product discounts are applied initially. Eligible wholesale/contractor customers receive their wholesale pricing flow.

At checkout, select a customer (or the walk-in customer), payment method, and tendered amount as needed. Available payment methods are Cash, Card, UPI, Bank Transfer, and Credit. Checkout performs its related records as one business operation:

1. validates product/variant/batch/kit availability;
2. calculates line discounts, tax, totals, payment, balance, and change due;
3. creates the invoice and invoice items using historical price, unit, discount, and FIFO cost snapshots;
4. deducts warehouse inventory and consumes the oldest available FIFO cost lots;
5. creates payment, customer ledger, and staff commission records where applicable; and
6. creates a credit balance or installment plan when the selected flow needs one.

The completed invoice can be viewed in sales history, printed, and exported as a receipt PDF in the client. A completed sale can be abandoned/reversed through the supported sales action, which reverses the relevant stock effect.

### 7. Customer credit and installment plans

Credit sales are visible in the credit workspace with outstanding, in-progress, payment history, and customer-level views. Record partial or full payments against invoices; excess tender is recorded as change rather than inflating the applied balance. Late fees can be applied through the dedicated credit action.

An installment sale remains a normal sales invoice for stock and reporting purposes, while a linked installment plan stores the down payment, agreed total, number/frequency of installments, and scheduled payments. The configured minimum down-payment percentage is copied to the plan at creation, so later settings changes do not alter historical agreements.

### 8. Staff, payroll, and expenses

Users can have an optional linked employee record. Payroll manages employees, salary, commission rate, payroll periods, payable amounts, and paid status. Sales commissions are generated from sales for linked employees with a commission rate.

Staff expenses are separate from payroll. A user with `EXPENSES_RECORD` can submit and view their own expense history/limit. A user with `EXPENSES_MANAGE` controls the shared budget, default and per-employee limits, adjustments, all-staff history, expenses recorded for another employee, and voiding. Voids preserve the record and refund the budget rather than deleting history.

### 9. Reporting, backup, and assistance

The dashboard presents summary values, sales trends, recent sales, and low-stock items. Reports can be explored in the browser and generated as PDF for daily sales, sales by product/category/variation, expenses, invoices, stock, low stock, and customer summaries. Settings also exposes a complete business-data backup export in Excel and PDF formats (password hashes are excluded).

The floating Store Assistant is a deterministic, rule-based chatbot—not an LLM or an external AI service. It answers selected live-data queries using regex/fuzzy matching for products, customers, and suppliers. It can propose stock adjustments, purchases, or new customers, but it only executes after an explicit confirmation such as `yes`; actions require both `CHATBOT_ACTIONS` and the underlying feature permission.

## Features

| Area | Included capability |
|---|---|
| Catalog | Products, categories, brands, product images, SKU/barcode, configurable units, pricing, tax, margin, discounts, HSN, variants, batches, area coverage |
| Inventory | Per-warehouse stock, stock movements, low-stock monitoring, batches/lots, FIFO cost lots, atomic transfers |
| POS & sales | Search/grid POS, scanner support, cart, customer price tiers, payment methods, receipts/PDF, invoices, sale reversal |
| Contacts & purchasing | Customers, customer purchase history, suppliers, purchase orders, supplier ledger and payments |
| Finance | Credit balances, late fees, partial payments/change due, installment schedules, payroll, commissions, staff expense budget/limits |
| Management | Dashboard, reporting, PDF/Excel export, business settings, backup export, user profiles/themes |
| Security | JWT authentication, password hashing, dynamic roles, per-user permission overrides, module gates, tenant isolation, platform/business token separation |
| Platform | Multiple businesses, business status, plan modules, admin-seat limits, primary-admin password resets, audit logs |

## Access control and tenancy

Business roles are fully dynamic. The first business administrator bypasses normal role checks; other users receive a role and can have explicit permission grants/revocations layered on top.

### Permission catalog

| Group | Permissions |
|---|---|
| Dashboard | `DASHBOARD_VIEW` |
| Products | `PRODUCTS_VIEW`, `PRODUCTS_EDIT`, `PRODUCTS_DELETE`, `PRICING_MANAGE`, `BARCODES_MANAGE`, `CATEGORIES_MANAGE`, `VARIATIONS_MANAGE`, `UNITS_MANAGE` |
| Inventory | `INVENTORY_VIEW`, `KITS_MANAGE`, `WAREHOUSES_MANAGE`, `TRANSFERS_VIEW`, `TRANSFERS_CREATE`, `PURCHASES_VIEW`, `PURCHASES_CREATE` |
| Contacts | `CUSTOMERS_MANAGE`, `SUPPLIERS_MANAGE` |
| Sales & finance | `SALES_CHECKOUT`, `SALES_VIEW`, `REPORTS_VIEW`, `CREDIT_MANAGE`, `INSTALLMENTS_MANAGE` |
| Administration | `PAYROLL_MANAGE`, `USERS_MANAGE`, `SETTINGS_MANAGE`, `CHATBOT_ACTIONS` |
| Expenses | `EXPENSES_RECORD`, `EXPENSES_MANAGE` |

Module availability is a second, platform-controlled gate. A disabled module is unavailable even if a role has a related permission. Available module keys are `PRODUCTS`, `INVENTORY`, `CONTACTS`, `SALES`, `PURCHASES`, `REPORTS`, `PAYROLL`, `EXPENSES`, `CREDIT`, `INSTALLMENTS`, `KITS`, and `ADMIN`.

## Technology

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, React Router 6, Tailwind CSS 3, Axios, Recharts |
| Client exports/printing | jsPDF, JsBarcode, browser print helpers |
| Backend | Node.js, Express 5, CommonJS |
| Database | PostgreSQL with Prisma 5 |
| Security | JSON Web Tokens, bcryptjs |
| Files/exports | Multer, PDFKit, ExcelJS |

## Requirements

- Node.js LTS and npm
- PostgreSQL database server
- A PostgreSQL user/database accessible through `DATABASE_URL`

## Installation and local startup

### 1. Create environment files

Copy the example files and set secure values.

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

### 2. Install backend dependencies and initialize Prisma

```powershell
Set-Location backend
npm install
npm run prisma:generate
npx prisma migrate dev
```

For a production database, use the already-created migrations instead:

```powershell
npx prisma migrate deploy
```

### 3. Create initial access

Choose one of these paths.

#### Recommended: platform-first onboarding

Create a platform-admin database record using a secure, one-off bootstrap method appropriate for your deployment. The repository includes `backend/create-platform-admin.js` as a development helper, but inspect and replace its hard-coded credentials before running it; do not commit real credentials.

```powershell
Set-Location backend
node create-platform-admin.js
```

Start the backend, visit `http://localhost:5173/platform/login` after starting the frontend, then create the business and its primary business administrator in the platform dashboard.

#### Development bootstrap seed

`backend/prisma/seed.js` creates one business, one primary administrator, and starter units (Piece, Box, Kilogram, Liter, Meter, Dozen). It deliberately does not create demo products, customers, suppliers, or roles.

Before seeding, replace every `CHANGEME` value in that file, including business details, primary-admin credentials, status, and enabled module keys. Then run:

```powershell
Set-Location backend
npm run prisma:seed
```

`npx prisma migrate reset` deletes all data in the selected database; use it only for an intentionally disposable local development database.

### 4. Run the backend

```powershell
Set-Location backend
npm run dev
```

The development API listens on `http://localhost:5000` by default. Confirm it at `GET http://localhost:5000/api/health`.

### 5. Run the frontend in a second terminal

```powershell
Set-Location frontend
npm install
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173`. The frontend uses `VITE_API_BASE_URL` to reach the API.

## Environment variables

### `backend/.env`

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/pos_inventory_db"
JWT_SECRET="replace-with-a-long-random-secret"
PORT=5000

# Optional defaults used by the backend configuration
JWT_EXPIRES_IN=24h
UPLOAD_DIR=uploads
NODE_ENV=development
```

`JWT_SECRET` is mandatory; the server intentionally refuses to start without it. Keep `.env` files, real database URLs, passwords, and upload folders out of source control.

### `frontend/.env`

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

If frontend and API are deployed to different origins, set this to the public API URL and configure CORS appropriately in the backend.

## Frontend routes

All tenant routes require a signed-in user; the UI additionally checks the matching permission before rendering a page.

| Route | Screen | Permission |
|---|---|---|
| `/login` | Business login | Public |
| `/` | Dashboard | `DASHBOARD_VIEW` |
| `/products`, `/categories`, `/variations`, `/units` | Catalog setup | Product/category/variation/unit permission |
| `/customers`, `/customers/:customerId/purchases`, `/suppliers` | Contact management | Contact permission |
| `/purchases`, `/inventory`, `/warehouses`, `/kits` | Stock operations | Matching inventory permission |
| `/pos`, `/sales`, `/sales/:invoiceId` | POS, sales history, invoice detail | Checkout or sales-view permission |
| `/credit`, `/installments` | Customer balances and payment plans | Matching finance permission |
| `/reports`, `/reports/generate/:reportKey` | Reports | `REPORTS_VIEW` |
| `/barcodes`, `/payroll`, `/expenses`, `/users`, `/settings` | Admin/operations pages | Matching permission |
| `/profile` | Current user's profile and theme | Any authenticated user |
| `/platform/login`, `/platform/dashboard` | Platform administration | Separate platform session |

## API reference

All endpoints below are relative to `VITE_API_BASE_URL`/`/api`. Except where noted, tenant endpoints require `Authorization: Bearer <tenant-jwt>`. Platform endpoints use a separate platform JWT.

| Base path | Principal operations |
|---|---|
| `/health` | Public health check |
| `/auth` | `POST /login`, `GET /me`, `POST /logout`, compatibility `POST /register` |
| `/categories` | List/get/create/update/delete categories |
| `/variations` | CRUD variations and variation values |
| `/units-of-measure` | CRUD configurable units |
| `/products` | List, search, barcode/SKU lookup, CRUD, upload image, batches, variants, barcode generation |
| `/customers` | CRUD customers and `/:id/purchases` |
| `/suppliers` | CRUD suppliers, `/:id/ledger`, and supplier payments |
| `/inventory` | Inventory listing and `/low-stock` |
| `/warehouses` | List/get/create/update/deactivate warehouses |
| `/transfers` | List and create stock transfers |
| `/purchases` | List/get/create purchase orders/receipts |
| `/kits` | CRUD kits and components |
| `/sales` | Checkout, invoice list/detail, abandon/reversal action, last-customer-batch helper |
| `/credit` | Outstanding/history/in-progress/customer balances, payments, late fees |
| `/installments` | Plans, plan detail, pay scheduled installment |
| `/dashboard` | Summary, sales chart, recent sales |
| `/reports` | Summary reports, generated report datasets, and PDF download |
| `/payroll` | Employees, payroll records, generation, mark-paid |
| `/expenses` | Own expense workflow plus budget/limits/history management |
| `/users`, `/roles` | Permission catalog, users, roles, overrides, deactivation |
| `/profile` | Profile, avatar, theme, password |
| `/settings` | Public branding, authenticated settings, logo, backup export |
| `/chatbot/message` | Rule-based Store Assistant conversation |
| `/platform/auth`, `/platform/businesses` | Platform login/session and multi-business management |

For a precise request body or response shape, use the matching frontend service in `frontend/src/services/` together with its backend controller/service. The API returns application errors through the central Express error handler.

## Data model

Prisma schema: `backend/prisma/schema.prisma`.

| Domain | Core records |
|---|---|
| Platform and identity | `PlatformAdmin`, `PlatformAuditLog`, `Business`, `User`, `Role`, `RolePermission`, `UserPermission`, `AuditLog` |
| Catalog | `Category`, `UnitOfMeasure`, `Variation`, `VariationValue`, `Product`, `ProductVariant`, `ProductVariantValue`, `ProductVariationAxis`, `Kit`, `KitComponent` |
| Inventory | `Warehouse`, `StockLevel`, `StockMovement`, `StockTransfer`, `Batch`, `CostLot` |
| Sales | `Customer`, `CustomerLedgerEntry`, `Invoice`, `InvoiceItem`, `Payment`, `InstallmentPlan`, `InstallmentPayment` |
| Purchasing | `Supplier`, `SupplierLedgerEntry`, `PurchaseOrder`, `PurchaseOrderItem` |
| People and expenses | `Employee`, `PayrollRecord`, `CommissionRecord`, `ExpenseBudget`, `ExpenseBudgetAdjustment`, `StaffExpenseLimit`, `StaffExpense` |
| Business configuration | `BusinessSettings` |

Historical sales records snapshot the unit, price, applied discount, and cost of goods sold. This preserves historical invoice/margin accuracy if a product, unit, price, or default discount is later changed.

## Project structure

```text
backend/
├── prisma/
│   ├── schema.prisma                Database models and enums
│   ├── migrations/                  Versioned PostgreSQL migrations
│   └── seed.js                      Development business/admin/unit bootstrap
├── src/
│   ├── app.js                       Express application and route mounts
│   ├── server.js                    HTTP server startup
│   ├── config/                      Environment, Prisma tenancy, modules, permissions
│   ├── middleware/                  Auth, permission, upload, platform auth, errors
│   ├── modules/                     Controller/service/router per business feature
│   └── utils/                       DTOs, PDF tables, ledger, matching, helpers
└── create-platform-admin.js         One-off development platform bootstrap helper

frontend/
├── src/
│   ├── App.jsx                      Route definitions and page permission guards
│   ├── pages/                       Page-level screens
│   ├── components/                  POS, product, dashboard, layout, receipt, common UI
│   ├── services/                    Axios API clients by feature
│   ├── context/ and hooks/          Auth, cart, theme, currency, settings state
│   ├── routes/                      Tenant and platform route guards
│   └── utils/                       Currency, receipts/PDF, scanner, formatting helpers
├── vite.config.js
└── tailwind.config.js
```

## Scripts and verification

### Backend

```powershell
Set-Location backend
npm run dev                 # Start with nodemon
npm start                   # Start with Node
npm run prisma:generate     # Generate Prisma client
npm run prisma:migrate      # Create/apply a development migration
npm run prisma:studio       # Open Prisma Studio
npm run prisma:seed         # Run development bootstrap seed
node scripts/validate-schema.js
```

### Frontend

```powershell
Set-Location frontend
npm run dev                 # Vite development server
npm run build               # Production build
npm run lint                # ESLint
npm run preview             # Preview built application
```

Suggested smoke test after setup:

1. Sign in as a primary business administrator.
2. Create a warehouse, unit/category, supplier, customer, and product.
3. Record a purchase into the warehouse.
4. Confirm stock in Inventory, then complete a POS cash sale.
5. Confirm invoice, stock reduction, recent-sales dashboard entry, and report output.
6. Create a restricted role and verify that disabled navigation/routes return the user to the dashboard and backend requests return `403`.
7. For multi-tenant deployments, create a second business and confirm no catalog, contact, invoice, or inventory records appear across businesses.

## Operational notes

- Use `npx prisma migrate deploy` in deployment pipelines; do not use `migrate reset` against a shared or production database.
- Back up PostgreSQL and `backend/uploads/` together. Database-only backups do not contain image files.
- The application currently enables CORS with the Express default (`app.use(cors())`). Restrict allowed origins before a public production deployment.
- The codebase has a placeholder backend `npm test` script; use schema validation, frontend linting, a production frontend build, and the smoke flow above until automated tests are added.
- Currency conversion in the client is display-only and uses local fixed-rate snapshots. Amounts are stored/entered in the business's operational currency.
- Barcode scanners work as keyboard input; no special scanner driver or API is required by the application.
- Do not commit `backend/.env`, `frontend/.env`, real platform-bootstrap credentials, database dumps, or upload directories.
