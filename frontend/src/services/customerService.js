import axiosInstance from './axiosInstance'

// Customer CRUD API layer.
export const customerService = {
  getAll: () => axiosInstance.get('/customers'),
  getById: (id) => axiosInstance.get(`/customers/${id}`),
  getPurchases: (id) => axiosInstance.get(`/customers/${id}/purchases`),
  create: (data) => axiosInstance.post('/customers', data),
  update: (id, data) => axiosInstance.put(`/customers/${id}`, data),
  remove: (id) => axiosInstance.delete(`/customers/${id}`),
}