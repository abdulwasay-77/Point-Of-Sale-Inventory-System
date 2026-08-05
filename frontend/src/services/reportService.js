import axiosInstance from './axiosInstance'

// Reports API layer — today's sales, monthly sales, low stock, plus the
// Generate Reports tab's data + PDF endpoints below.
export const reportService = {
  getTodaySales: () => axiosInstance.get('/reports/today-sales'),
  getMonthlySales: (month, year) =>
    axiosInstance.get('/reports/monthly-sales', { params: { month, year } }),
  getLowStock: () => axiosInstance.get('/reports/low-stock'),

  // ---- Generate Reports: Sales section ----
  getDailySales: (date) => axiosInstance.get('/reports/daily-sales', { params: { date } }),
  getSalesByProduct: (params) => axiosInstance.get('/reports/sales-by-product', { params }),
  getSalesByCategory: (params) => axiosInstance.get('/reports/sales-by-category', { params }),
  getSalesByVariation: (params) => axiosInstance.get('/reports/sales-by-variation', { params }),
  getExpensesReport: (params) => axiosInstance.get('/reports/expenses-report', { params }),
  getInvoicesReport: (params) => axiosInstance.get('/reports/invoices-report', { params }),

  // ---- Generate Reports: Inventory section ----
  getStockReport: () => axiosInstance.get('/reports/stock-report'),
  getLowStockReport: () => axiosInstance.get('/reports/low-stock-report'),

  // ---- Generate Reports: Customer section ----
  getCustomerSummary: () => axiosInstance.get('/reports/customer-summary'),

  // One shared PDF endpoint for every report card — reportKey picks the
  // report, params carries whatever filter that report's page is
  // currently showing (range/startDate/endDate/date), so the PDF always
  // matches exactly what's on screen when you click Generate PDF.
  downloadReportPdf: (reportKey, params) =>
    axiosInstance.get(`/reports/pdf/${reportKey}`, { params, responseType: 'blob' }),
}