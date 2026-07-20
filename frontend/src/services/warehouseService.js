
import axiosInstance from './axiosInstance'

// Warehouse (multi-location) API layer.
export const warehouseService = {
  getAll: () => axiosInstance.get('/warehouses'),
  getById: (id) => axiosInstance.get(`/warehouses/${id}`),
  create: (data) => axiosInstance.post('/warehouses', data),
  update: (id, data) => axiosInstance.put(`/warehouses/${id}`, data),
  remove: (id) => axiosInstance.delete(`/warehouses/${id}`),
}
