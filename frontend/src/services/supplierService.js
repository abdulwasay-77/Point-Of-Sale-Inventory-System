
import axiosInstance from './axiosInstance'

// Supplier CRUD API layer.
export const supplierService = {
  getAll: () => axiosInstance.get('/suppliers'),
  getById: (id) => axiosInstance.get(`/suppliers/${id}`),
  create: (data) => axiosInstance.post('/suppliers', data),
  update: (id, data) => axiosInstance.put(`/suppliers/${id}`, data),
  remove: (id) => axiosInstance.delete(`/suppliers/${id}`),
  getLedger: (id) => axiosInstance.get(`/suppliers/${id}/ledger`),
  recordPayment: (id, data) => axiosInstance.post(`/suppliers/${id}/payments`, data),
}
