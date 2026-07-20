
// Granular permission system. A user's *effective* permissions =
// (their role's default set) with any per-user overrides applied on top
// (see UserPermission in schema.prisma: granted=true adds, granted=false
// revokes). This lets an admin start from a sensible role template and
// then adjust individual users without inventing a new role every time.

// Every permission the app checks for, grouped by module. Keep keys
// stable — they're stored as plain strings in user_permissions.permission.
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
  // Dashboard
  DASHBOARD_VIEW: 'DASHBOARD_VIEW',
  // User & role management
  USERS_MANAGE: 'USERS_MANAGE',
  // Chatbot actions (separate from read-only chatbot Q&A, which only needs a login)
  CHATBOT_ACTIONS: 'CHATBOT_ACTIONS',
};

// Human-readable labels + grouping, used by the frontend to render the
// permissions grid without hardcoding copy in two places.
const PERMISSION_CATALOG = [
  { key: PERMISSIONS.DASHBOARD_VIEW, label: 'View dashboard', group: 'Dashboard' },
  { key: PERMISSIONS.PRODUCTS_VIEW, label: 'View products', group: 'Products' },
  { key: PERMISSIONS.PRODUCTS_EDIT, label: 'Create / edit products', group: 'Products' },
  { key: PERMISSIONS.PRODUCTS_DELETE, label: 'Delete products', group: 'Products' },
  { key: PERMISSIONS.PRICING_MANAGE, label: 'Edit GST, discount & pricing', group: 'Products' },
  { key: PERMISSIONS.BARCODES_MANAGE, label: 'Generate & print barcode labels', group: 'Products' },
  { key: PERMISSIONS.CATEGORIES_MANAGE, label: 'Manage categories', group: 'Products' },
  { key: PERMISSIONS.INVENTORY_VIEW, label: 'View inventory', group: 'Inventory' },
  { key: PERMISSIONS.KITS_MANAGE, label: 'Manage kits & bundles', group: 'Inventory' },
  { key: PERMISSIONS.WAREHOUSES_MANAGE, label: 'Manage warehouses', group: 'Inventory' },
  { key: PERMISSIONS.TRANSFERS_VIEW, label: 'View stock transfers', group: 'Inventory' },
  { key: PERMISSIONS.TRANSFERS_CREATE, label: 'Create stock transfers', group: 'Inventory' },
  { key: PERMISSIONS.PURCHASES_VIEW, label: 'View purchases', group: 'Inventory' },
  { key: PERMISSIONS.PURCHASES_CREATE, label: 'Record purchases', group: 'Inventory' },
  { key: PERMISSIONS.CUSTOMERS_MANAGE, label: 'Manage customers', group: 'Contacts' },
  { key: PERMISSIONS.SUPPLIERS_MANAGE, label: 'Manage suppliers', group: 'Contacts' },
  { key: PERMISSIONS.SALES_CHECKOUT, label: 'Use POS / checkout', group: 'Sales' },
  { key: PERMISSIONS.SALES_VIEW, label: 'View sales history', group: 'Sales' },
  { key: PERMISSIONS.REPORTS_VIEW, label: 'View reports', group: 'Sales' },
  { key: PERMISSIONS.PAYROLL_MANAGE, label: 'Manage payroll', group: 'Admin' },
  { key: PERMISSIONS.USERS_MANAGE, label: 'Manage users & roles', group: 'Admin' },
  { key: PERMISSIONS.CHATBOT_ACTIONS, label: 'Let chatbot perform actions', group: 'Admin' },
];

// Default permission set granted to each role. ADMIN gets everything so
// existing behaviour (role-gated routes) is unaffected unless an admin
// deliberately revokes something for a specific user.
const ROLE_DEFAULTS = {
  ADMIN: Object.values(PERMISSIONS),
  ACCOUNTANT: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.CUSTOMERS_MANAGE,
    PERMISSIONS.SUPPLIERS_MANAGE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.PAYROLL_MANAGE,
    PERMISSIONS.TRANSFERS_VIEW,
  ],
  SALES_STAFF: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.CUSTOMERS_MANAGE,
    PERMISSIONS.SALES_CHECKOUT,
    PERMISSIONS.SALES_VIEW,
  ],
  WAREHOUSE_STAFF: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_EDIT,
    PERMISSIONS.CATEGORIES_MANAGE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_CREATE,
    PERMISSIONS.SUPPLIERS_MANAGE,
    PERMISSIONS.KITS_MANAGE,
    PERMISSIONS.WAREHOUSES_MANAGE,
    PERMISSIONS.TRANSFERS_VIEW,
    PERMISSIONS.TRANSFERS_CREATE,
  ],
};

module.exports = { PERMISSIONS, PERMISSION_CATALOG, ROLE_DEFAULTS };
