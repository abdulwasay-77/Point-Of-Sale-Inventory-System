
import axiosInstance from './axiosInstance'

// Dashboard summary API layer.
export const dashboardService = {
  getSummary: () => axiosInstance.get('/dashboard/summary'),
}
