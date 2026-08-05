/**
 * Single source of truth for every card on the Generate Reports tab and
 * every report's detail page (frontend/src/pages/reports/GenerateReportsTab.jsx
 * and ReportDetailPage.jsx). Adding a new report to the app should only
 * ever mean adding one entry here (plus its data method + PDF branch in
 * backend/src/modules/reports/reports.service.js) — never touching the
 * tab grid or detail page markup directly.
 *
 * filterType:
 *  - 'date'  → single date picker, defaults to today (Daily Sales)
 *  - 'range' → preset dropdown (All time/Today/This week/This month/
 *              This year/Custom), with two date inputs when Custom is
 *              picked — same presets reports.service.js#resolveDateRange
 *              understands
 *  - 'none'  → no filter controls at all (point-in-time snapshots)
 *
 * columns: driven straight off each report's API response fields — see
 * the matching branch in reports.service.js#generateReportPdf for the
 * backend's mirror of this same column list (kept in sync by hand,
 * same as the rest of this app's DTOs).
 */

export const REPORT_SECTIONS = [
  {
    key: 'sales',
    label: 'Sales Reports',
    icon: 'sales',
    tone: 'amber',
    reportKeys: ['daily-sales', 'sales-by-product', 'sales-by-category', 'sales-by-variation', 'expenses', 'invoices'],
  },
  {
    key: 'inventory',
    label: 'Inventory Reports',
    icon: 'inventory',
    tone: 'rose',
    reportKeys: ['stock-report', 'low-stock-report'],
  },
  {
    key: 'customers',
    label: 'Customer Reports',
    icon: 'customers',
    tone: 'teal',
    reportKeys: ['customer-summary'],
  },
]

export const REPORT_DEFINITIONS = {
  'daily-sales': {
    label: 'Daily Sales',
    description: 'Every completed sale for one specific day.',
    icon: 'calendar',
    filterType: 'date',
    fetch: (reportService, filters) => reportService.getDailySales(filters.date),
    columns: [
      { key: 'invoiceNumber', label: 'Invoice #' },
      { key: 'date', label: 'Date', type: 'datetime' },
      { key: 'customer', label: 'Customer' },
      { key: 'cashier', label: 'Cashier' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'total', label: 'Total', type: 'currency', align: 'right' },
    ],
    summary: (data) => [
      { label: 'Invoices', value: data.count ?? 0 },
      { label: 'Total', value: data.total ?? 0, type: 'currency' },
    ],
  },
  'sales-by-product': {
    label: 'Sales by Product',
    description: 'Units sold and revenue, grouped by product.',
    icon: 'products',
    filterType: 'range',
    fetch: (reportService, filters) => reportService.getSalesByProduct(filters),
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'quantitySold', label: 'Qty Sold', align: 'right' },
      { key: 'revenue', label: 'Revenue', type: 'currency', align: 'right' },
    ],
    summary: (data) => [
      { label: 'Products', value: data.rows?.length ?? 0 },
      { label: 'Total Revenue', value: data.totalRevenue ?? 0, type: 'currency' },
    ],
  },
  'sales-by-category': {
    label: 'Sales by Category',
    description: 'Units sold and revenue, grouped by category.',
    icon: 'categories',
    filterType: 'range',
    fetch: (reportService, filters) => reportService.getSalesByCategory(filters),
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'quantitySold', label: 'Qty Sold', align: 'right' },
      { key: 'revenue', label: 'Revenue', type: 'currency', align: 'right' },
    ],
    summary: (data) => [
      { label: 'Categories', value: data.rows?.length ?? 0 },
      { label: 'Total Revenue', value: data.totalRevenue ?? 0, type: 'currency' },
    ],
  },
  'sales-by-variation': {
    label: 'Sales by Variation',
    description: 'Units sold and revenue, grouped by variation value (e.g. Red, 6 inch).',
    icon: 'variations',
    filterType: 'range',
    fetch: (reportService, filters) => reportService.getSalesByVariation(filters),
    columns: [
      { key: 'variation', label: 'Variation' },
      { key: 'value', label: 'Value' },
      { key: 'quantitySold', label: 'Qty Sold', align: 'right' },
      { key: 'revenue', label: 'Revenue', type: 'currency', align: 'right' },
    ],
    summary: (data) => [
      { label: 'Variation Values', value: data.rows?.length ?? 0 },
      { label: 'Total Revenue', value: data.totalRevenue ?? 0, type: 'currency' },
    ],
  },
  expenses: {
    label: 'Expenses',
    description: 'Staff expense claims, with employee, category, and amount.',
    icon: 'expenses',
    filterType: 'range',
    fetch: (reportService, filters) => reportService.getExpensesReport(filters),
    columns: [
      { key: 'employeeName', label: 'Employee' },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description' },
      { key: 'expenseDate', label: 'Date', type: 'date' },
      { key: 'amount', label: 'Amount', type: 'currency', align: 'right' },
      { key: 'status', label: 'Status' },
    ],
    summary: (data) => [
      { label: 'Expenses', value: data.count ?? 0 },
      { label: 'Total Spent', value: data.totalSpent ?? 0, type: 'currency' },
    ],
  },
  invoices: {
    label: 'Invoices',
    description: 'Every invoice, with sale type, total, and balance due.',
    icon: 'sales',
    filterType: 'range',
    fetch: (reportService, filters) => reportService.getInvoicesReport(filters),
    columns: [
      { key: 'invoiceNumber', label: 'Invoice #' },
      { key: 'date', label: 'Date', type: 'datetime' },
      { key: 'customer', label: 'Customer' },
      { key: 'saleType', label: 'Sale Type' },
      { key: 'total', label: 'Total', type: 'currency', align: 'right' },
      { key: 'balanceDue', label: 'Balance Due', type: 'currency', align: 'right' },
      { key: 'status', label: 'Status' },
    ],
    summary: (data) => [
      { label: 'Invoices', value: data.count ?? 0 },
      { label: 'Total Amount', value: data.totalAmount ?? 0, type: 'currency' },
    ],
  },
  'stock-report': {
    label: 'Stock Report',
    description: 'Every active product and its current stock level.',
    icon: 'inventory',
    filterType: 'none',
    fetch: (reportService) => reportService.getStockReport(),
    columns: [
      { key: 'name', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'stock', label: 'Stock', align: 'right' },
      { key: 'reorderThreshold', label: 'Reorder At', align: 'right' },
    ],
    summary: (data) => [{ label: 'Products', value: data.count ?? 0 }],
  },
  'low-stock-report': {
    label: 'Low Stock Report',
    description: 'Products at or below their reorder threshold.',
    icon: 'inventory',
    filterType: 'none',
    fetch: (reportService) => reportService.getLowStockReport(),
    columns: [
      { key: 'name', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'stock', label: 'Stock', align: 'right' },
      { key: 'reorderThreshold', label: 'Reorder At', align: 'right' },
    ],
    summary: (data) => [{ label: 'Products Low', value: data.count ?? 0 }],
  },
  'customer-summary': {
    label: 'Customer Summary',
    description: 'Total purchases, invoice count, and outstanding balance per customer.',
    icon: 'customers',
    filterType: 'none',
    fetch: (reportService) => reportService.getCustomerSummary(),
    columns: [
      { key: 'name', label: 'Customer' },
      { key: 'phone', label: 'Phone' },
      { key: 'customerType', label: 'Type' },
      { key: 'invoiceCount', label: 'Invoices', align: 'right' },
      { key: 'totalPurchases', label: 'Total Purchases', type: 'currency', align: 'right' },
      { key: 'outstandingBalance', label: 'Outstanding', type: 'currency', align: 'right' },
    ],
    summary: (data) => [
      { label: 'Customers', value: data.totalCustomers ?? 0 },
      { label: 'Outstanding', value: data.totalOutstanding ?? 0, type: 'currency' },
    ],
  },
}

export const RANGE_OPTIONS = [
  { value: '', label: 'All time' },
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This week' },
  { value: 'monthly', label: 'This month' },
  { value: 'yearly', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
]