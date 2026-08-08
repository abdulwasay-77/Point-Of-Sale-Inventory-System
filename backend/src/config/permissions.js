// Granular permission system. A user's *effective* permissions =
// (their role's permission set, stored in the roles/role_permissions
// tables — see roles.service.js) with any per-user overrides applied on
// top (see UserPermission in schema.prisma: granted=true adds,
// granted=false revokes). This lets an admin build a role once and then
// adjust individual users without inventing a new role every time.
//
// Roles themselves are dynamic (admin-managed via /api/roles) — what's
// fixed here is only the CATALOG of permissions that exist to assign.
// A brand-new role starts with none of these; an admin grants exactly
// what it needs from this list.

const { MODULES } = require('./modules');

// Every permission the app checks for, grouped by module. Keep keys
// stable — they're stored as plain strings in both user_permissions.
// permission and role_permissions.permission.
const PERMISSIONS = {
  // Products
  PRODUCTS_VIEW: 'PRODUCTS_VIEW',
  PRODUCTS_EDIT: 'PRODUCTS_EDIT', // create + update
  PRODUCTS_DELETE: 'PRODUCTS_DELETE',
  // Pricing fields specifically (GST rate, discount, target margin, cost
  // price) — deliberately separate from PRODUCTS_EDIT so a role like
  // Warehouse Staff can still edit ordinary product details without being
  // able to touch tax/pricing. Admin-only by default.
  PRICING_MANAGE: 'PRICING_MANAGE',
  // Generating/printing barcode labels. Admin-only by default.
  BARCODES_MANAGE: 'BARCODES_MANAGE',
  // Categories
  CATEGORIES_MANAGE: 'CATEGORIES_MANAGE',
  // Variations (e.g. Color, Diameter) — reusable, defined once and
  // reused across products, managed on their own page.
  VARIATIONS_MANAGE: 'VARIATIONS_MANAGE',
  // Units of measure (e.g. Box, Sqft) — reusable, defined once and
  // reused across products, managed on their own page. Same shape as
  // VARIATIONS_MANAGE above.
  UNITS_MANAGE: 'UNITS_MANAGE',
  // Customers
  CUSTOMERS_MANAGE: 'CUSTOMERS_MANAGE',
  // Suppliers
  SUPPLIERS_MANAGE: 'SUPPLIERS_MANAGE',
  // Inventory
  INVENTORY_VIEW: 'INVENTORY_VIEW',
  // Kits & bundles
  KITS_MANAGE: 'KITS_MANAGE',
  // Warehouses & transfers
  WAREHOUSES_MANAGE: 'WAREHOUSES_MANAGE',
  TRANSFERS_CREATE: 'TRANSFERS_CREATE',
  TRANSFERS_VIEW: 'TRANSFERS_VIEW',
  // Purchases
  PURCHASES_VIEW: 'PURCHASES_VIEW',
  PURCHASES_CREATE: 'PURCHASES_CREATE',
  // Sales / POS
  SALES_VIEW: 'SALES_VIEW',
  SALES_CHECKOUT: 'SALES_CHECKOUT',
  // Reports
  REPORTS_VIEW: 'REPORTS_VIEW',
  // Payroll
  PAYROLL_MANAGE: 'PAYROLL_MANAGE',
  // Staff Expense Management — independent from Payroll. RECORD is the
  // everyday "log my own expense" action every staff member gets;
  // MANAGE is the budget/limits/void/full-history admin surface. See
  // modules/expenses/*.
  EXPENSES_RECORD: 'EXPENSES_RECORD',
  EXPENSES_MANAGE: 'EXPENSES_MANAGE',
  // Dashboard
  DASHBOARD_VIEW: 'DASHBOARD_VIEW',
  // User & role management
  USERS_MANAGE: 'USERS_MANAGE',
  // Customer credit — the CustomerCredit module (outstanding balances,
  // due dates, late fees). Recording a partial payment *at checkout* only
  // needs SALES_CHECKOUT; this gates the dedicated admin page and the
  // late-fee action.
  CREDIT_MANAGE: 'CREDIT_MANAGE',
  // Installment plans — creating/managing a schedule and marking
  // individual installments paid. Same split as credit above: starting a
  // plan at checkout only needs SALES_CHECKOUT.
  INSTALLMENTS_MANAGE: 'INSTALLMENTS_MANAGE',
  // Website settings (business info, defaults, backup export). Deliberately
  // NOT granted to every role by default — see the seeded role permission
  // sets in the dynamic_roles migration.
  SETTINGS_MANAGE: 'SETTINGS_MANAGE',
  // Chatbot actions (separate from read-only chatbot Q&A, which only needs a login)
  CHATBOT_ACTIONS: 'CHATBOT_ACTIONS',
};

// Human-readable labels + grouping, used by the frontend to render the
// permissions grid (both the per-user Permissions modal and the new
// Manage Roles screen) without hardcoding copy in two places.
//
// Each entry also carries `module`: the business-plan module (see
// config/modules.js — same key authMiddleware.js checks via
// ROUTE_MODULE_MAP) that permission actually requires. A permission
// with `module: null` is core functionality with no route-level module
// gate (dashboard, settings, chatbot) and is always offered regardless
// of plan. Kept as an explicit per-permission field, rather than
// inferring it from the `group` label above, because `group` is a UI
// grouping only and deliberately doesn't line up 1:1 with modules
// (e.g. group "Sales" spans the SALES, REPORTS, CREDIT and
// INSTALLMENTS modules) — reusing it would silently mis-tag several
// permissions.
const PERMISSION_CATALOG = [
  { key: PERMISSIONS.DASHBOARD_VIEW, label: 'View dashboard', group: 'Dashboard', module: null },
  { key: PERMISSIONS.PRODUCTS_VIEW, label: 'View products', group: 'Products', module: 'PRODUCTS' },
  { key: PERMISSIONS.PRODUCTS_EDIT, label: 'Create / edit products', group: 'Products', module: 'PRODUCTS' },
  { key: PERMISSIONS.PRODUCTS_DELETE, label: 'Delete products', group: 'Products', module: 'PRODUCTS' },
  { key: PERMISSIONS.PRICING_MANAGE, label: 'Edit GST, discount & pricing', group: 'Products', module: 'PRODUCTS' },
  { key: PERMISSIONS.BARCODES_MANAGE, label: 'Generate & print barcode labels', group: 'Products', module: 'PRODUCTS' },
  { key: PERMISSIONS.CATEGORIES_MANAGE, label: 'Manage categories', group: 'Products', module: 'PRODUCTS' },
  { key: PERMISSIONS.VARIATIONS_MANAGE, label: 'Manage variations (e.g. Color, Diameter)', group: 'Products', module: 'PRODUCTS' },
  { key: PERMISSIONS.UNITS_MANAGE, label: 'Manage units of measure', group: 'Products', module: 'PRODUCTS' },
  { key: PERMISSIONS.INVENTORY_VIEW, label: 'View inventory', group: 'Inventory', module: 'INVENTORY' },
  { key: PERMISSIONS.KITS_MANAGE, label: 'Manage kits & bundles', group: 'Inventory', module: 'KITS' },
  { key: PERMISSIONS.WAREHOUSES_MANAGE, label: 'Manage warehouses', group: 'Inventory', module: 'INVENTORY' },
  { key: PERMISSIONS.TRANSFERS_VIEW, label: 'View stock transfers', group: 'Inventory', module: 'INVENTORY' },
  { key: PERMISSIONS.TRANSFERS_CREATE, label: 'Create stock transfers', group: 'Inventory', module: 'INVENTORY' },
  { key: PERMISSIONS.PURCHASES_VIEW, label: 'View purchases', group: 'Inventory', module: 'PURCHASES' },
  { key: PERMISSIONS.PURCHASES_CREATE, label: 'Record purchases', group: 'Inventory', module: 'PURCHASES' },
  { key: PERMISSIONS.CUSTOMERS_MANAGE, label: 'Manage customers', group: 'Contacts', module: 'CONTACTS' },
  { key: PERMISSIONS.SUPPLIERS_MANAGE, label: 'Manage suppliers', group: 'Contacts', module: 'CONTACTS' },
  { key: PERMISSIONS.SALES_CHECKOUT, label: 'Use POS / checkout', group: 'Sales', module: 'SALES' },
  { key: PERMISSIONS.SALES_VIEW, label: 'View sales history', group: 'Sales', module: 'SALES' },
  { key: PERMISSIONS.REPORTS_VIEW, label: 'View reports', group: 'Sales', module: 'REPORTS' },
  { key: PERMISSIONS.PAYROLL_MANAGE, label: 'Manage payroll', group: 'Admin', module: 'PAYROLL' },
  { key: PERMISSIONS.USERS_MANAGE, label: 'Manage users & roles', group: 'Admin', module: 'ADMIN' },
  { key: PERMISSIONS.CREDIT_MANAGE, label: 'Manage customer credit & late fees', group: 'Sales', module: 'CREDIT' },
  { key: PERMISSIONS.INSTALLMENTS_MANAGE, label: 'Manage installment plans', group: 'Sales', module: 'INSTALLMENTS' },
  { key: PERMISSIONS.SETTINGS_MANAGE, label: 'Manage website settings', group: 'Admin', module: null },
  { key: PERMISSIONS.CHATBOT_ACTIONS, label: 'Let chatbot perform actions', group: 'Admin', module: null },
  { key: PERMISSIONS.EXPENSES_RECORD, label: 'Record own staff expenses', group: 'Expenses', module: 'EXPENSES' },
  { key: PERMISSIONS.EXPENSES_MANAGE, label: 'Manage expense budget, limits & history', group: 'Expenses', module: 'EXPENSES' },
];

// key -> required module (or null for core/always-available), derived
// from the catalog above so there's exactly one place this mapping is
// maintained.
const PERMISSION_MODULE_MAP = PERMISSION_CATALOG.reduce((acc, p) => {
  acc[p.key] = p.module;
  return acc;
}, {});

// Sanity check against typos: every non-null `module` referenced above
// must be a real module key from config/modules.js. Fails fast at
// startup rather than silently letting a mistyped module string mean a
// permission is treated as always-available (or never-available).
const VALID_MODULE_KEYS = new Set(Object.keys(MODULES));
for (const p of PERMISSION_CATALOG) {
  if (p.module && !VALID_MODULE_KEYS.has(p.module)) {
    throw new Error(`config/permissions.js: "${p.key}" references unknown module "${p.module}"`);
  }
}

// Is this permission actually usable for a business with this set of
// enabled modules? True for core permissions (module: null) and for any
// permission whose module is in `enabledModules`. Used to keep what a
// role/user can be GRANTED in sync with what the business's plan
// actually allows — the authMiddleware.js module gate already blocks
// the underlying routes regardless, but without this, an admin could
// still tick a checkbox for a feature their plan doesn't include, which
// is confusing even though it's harmless.
function isPermissionAllowedForModules(permissionKey, enabledModules = []) {
  const requiredModule = PERMISSION_MODULE_MAP[permissionKey];
  return !requiredModule || enabledModules.includes(requiredModule);
}

// Filters a full/partial permission-catalog array down to only entries
// usable by a business with this set of enabled modules. Used to build
// the catalog GET /users/permissions/catalog returns, so the "Add Role"
// and per-user Permissions checkbox grids only ever show options that
// can actually do something.
function filterCatalogForModules(catalog, enabledModules = []) {
  return catalog.filter((p) => isPermissionAllowedForModules(p.key, enabledModules));
}

module.exports = {
  PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_MODULE_MAP,
  isPermissionAllowedForModules,
  filterCatalogForModules,
};