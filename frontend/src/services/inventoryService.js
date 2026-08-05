
import axiosInstance from './axiosInstance'

// Inventory read-only API layer (stock levels, low-stock flags).
export const inventoryService = {
  getAll: () => axiosInstance.get('/inventory'),
  getLowStock: () => axiosInstance.get('/inventory/low-stock'),
}
