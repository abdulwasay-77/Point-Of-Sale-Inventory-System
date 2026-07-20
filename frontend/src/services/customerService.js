
import axiosInstance from './axiosInstance'

// Customer CRUD API layer.
export const customerService = {
  getAll: () => axiosInstance.get('/customers'),
  getById: (id) => axiosInstance.get(`/customers/${id}`),
  create: (data) => axiosInstance.post('/customers', data),
  update: (id, data) => axiosInstance.put(`/customers/${id}`, data),
  remove: (id) => axiosInstance.delete(`/customers/${id}`),
}
