// Canonical list of feature "modules" a Super Admin can turn on/off per
// business (see Business.enabled_modules in schema.prisma). This is a
// platform-level gate, separate from and checked BEFORE the existing
// role/permission system (config/permissions.js) — a business without
// a module enabled can't reach it regardless of a staff member's role.
//
// Deliberately reuses the same group names already used to organize
// config/permissions.js, so the same mental model ("Products",
// "Inventory", "Sales"...) works for both role permissions (who, within
// an enabled module, can do what) and business modules (which modules
// exist for this business at all).
const MODULES = {
  PRODUCTS: 'Products & Catalog',
  UNITS: 'Units of Measure',
  INVENTORY: 'Inventory & Warehouses',
  CONTACTS: 'Customers & Suppliers',
  SALES: 'Point of Sale & Invoices',
  PURCHASES: 'Purchases & Receiving',
  REPORTS: 'Reports & Dashboard',
  PAYROLL: 'Payroll',
  EXPENSES: 'Staff Expenses',
  CREDIT: 'Customer Credit',
  INSTALLMENTS: 'Installment Plans',
  KITS: 'Kits & Bundles',
  ADMIN: 'Users, Roles & Settings',
};

// Maps an Express route's mount path (req.baseUrl, as registered in
// app.js) to the module that gates it. Routes not listed here (auth,
// profile, dashboard health, etc.) are core functionality and are never
// module-gated — every active business always has them.
const ROUTE_MODULE_MAP = {
  '/api/categories': 'PRODUCTS',
  '/api/variations': 'PRODUCTS',
  '/api/units-of-measure': 'UNITS',
  '/api/products': 'PRODUCTS',
  '/api/kits': 'KITS',
  '/api/customers': 'CONTACTS',
  '/api/suppliers': 'CONTACTS',
  '/api/inventory': 'INVENTORY',
  '/api/warehouses': 'INVENTORY',
  '/api/transfers': 'INVENTORY',
  '/api/purchases': 'PURCHASES',
  '/api/sales': 'SALES',
  '/api/credit': 'CREDIT',
  '/api/installments': 'INSTALLMENTS',
  '/api/reports': 'REPORTS',
  '/api/payroll': 'PAYROLL',
  '/api/expenses': 'EXPENSES',
  '/api/users': 'ADMIN',
  '/api/roles': 'ADMIN',
};

// Sensible starting point for a brand-new business — the core loop
// (catalog, units, inventory, contacts, POS, reports) plus admin/user
// management, without the more specialized add-ons. UNITS is included
// unconditionally alongside PRODUCTS (not treated as optional like the
// other add-ons): a product literally cannot be created without at
// least one unit of measure to assign it (see products.service.js),
// so a business missing this module would be unable to use its
// catalog at all, trial or not. A Super Admin can still change this
// per business at any time from the platform dashboard.
const DEFAULT_MODULES = ['PRODUCTS', 'UNITS', 'INVENTORY', 'CONTACTS', 'SALES', 'PURCHASES', 'REPORTS', 'ADMIN'];

module.exports = { MODULES, ROUTE_MODULE_MAP, DEFAULT_MODULES };