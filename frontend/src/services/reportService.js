
import axiosInstance from './axiosInstance'

// Reports API layer — today's sales, monthly sales, low stock.
export const reportService = {
  getTodaySales: () => axiosInstance.get('/reports/today-sales'),
  getMonthlySales: (month, year) =>
    axiosInstance.get('/reports/monthly-sales', { params: { month, year } }),
  getLowStock: () => axiosInstance.get('/reports/low-stock'),
}
