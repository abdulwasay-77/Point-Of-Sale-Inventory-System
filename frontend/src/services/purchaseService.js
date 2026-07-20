
import axiosInstance from './axiosInstance'

// Purchase API layer — creating a purchase automatically increases stock
// on the backend (handled server-side once implemented).
export const purchaseService = {
  getAll: () => axiosInstance.get('/purchases'),
  getById: (id) => axiosInstance.get(`/purchases/${id}`),
  create: (data) => axiosInstance.post('/purchases', data),
}
