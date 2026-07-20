
import axiosInstance from './axiosInstance'

// Sales / POS checkout API layer.
export const salesService = {
  getAll: (params) => axiosInstance.get('/sales', { params }),
  getById: (id) => axiosInstance.get(`/sales/${id}`),
  checkout: (data) => axiosInstance.post('/sales/checkout', data),
}
