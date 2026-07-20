

// App-wide constants.

export const ROLES = {
  ADMIN: 'ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  SALES_STAFF: 'SALES_STAFF',
  WAREHOUSE_STAFF: 'WAREHOUSE_STAFF',
}

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
  { label: 'Customers', path: '/customers', icon: 'customers' },
  { label: 'Suppliers', path: '/suppliers', icon: 'suppliers' },
  { label: 'Purchases', path: '/purchases', icon: 'purchases' },
  { label: 'Inventory', path: '/inventory', icon: 'inventory' },
  { label: 'Kits & Bundles', path: '/kits', icon: 'products' },
  { label: 'Warehouses', path: '/warehouses', icon: 'inventory' },
  { label: 'POS', path: '/pos', icon: 'pos' },
  { label: 'Sales', path: '/sales', icon: 'sales' },
  { label: 'Reports', path: '/reports', icon: 'reports' },
  { label: 'Users', path: '/users', icon: 'users' },
]
