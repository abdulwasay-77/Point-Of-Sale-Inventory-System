import axiosInstance from './axiosInstance'

// Dashboard summary + chart API layer.
export const dashboardService = {
  getSummary: () => axiosInstance.get('/dashboard/summary'),
  getSalesChart: (period = 'weekly') => axiosInstance.get('/dashboard/sales-chart', { params: { period } }),
  getRecentSales: (limit = 8) => axiosInstance.get('/dashboard/recent-sales', { params: { limit } }),
}