// App-wide constants.

// Note: there used to be a fixed ROLES object here (ADMIN/ACCOUNTANT/
// SALES_STAFF/WAREHOUSE_STAFF). Roles are fully dynamic now — an admin
// defines whatever roles their business needs from Users & Roles, so
// there's no fixed set to hardcode here. See rolesService.js instead.

export const LOW_STOCK_THRESHOLD = 10

// Payment methods offered at the POS checkout screen. `value` matches the
// backend PaymentMethod enum values accepted by POST /sales/checkout.
export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Online Transfer' },
]

export const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: 'dashboard' },
  { label: 'Products', path: '/products', icon: 'products' },
  { label: 'Barcode Labels', path: '/barcodes', icon: 'barcode' },
  { label: 'Categories', path: '/categories', icon: 'categories' },
  { label: 'Variations', path: '/variations', icon: 'variations' },
  { label: 'Units', path: '/units', icon: 'unitOfMeasure' },
  { label: 'Customers', path: '/customers', icon: 'customers' },
  { label: 'Suppliers', path: '/suppliers', icon: 'suppliers' },
  { label: 'Purchases', path: '/purchases', icon: 'purchases' },
  { label: 'Inventory', path: '/inventory', icon: 'inventory' },
  { label: 'Kits & Bundles', path: '/kits', icon: 'kits' },
  { label: 'Warehouses', path: '/warehouses', icon: 'warehouses' },
  { label: 'POS', path: '/pos', icon: 'pos' },
  { label: 'Sales', path: '/sales', icon: 'sales' },
  { label: 'Customer Credit', path: '/credit', icon: 'creditCard' },
  { label: 'Installments', path: '/installments', icon: 'calendar' },
  { label: 'Payroll', path: '/payroll', icon: 'payroll' },
  { label: 'Expenses', path: '/expenses', icon: 'expenses' },
  { label: 'Reports', path: '/reports', icon: 'reports' },
  { label: 'Users', path: '/users', icon: 'users' },
  { label: 'Profile', path: '/profile', icon: 'userCircle' },
  { label: 'Settings', path: '/settings', icon: 'settings' },
]