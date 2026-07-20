
import axiosInstance from './axiosInstance'

// Product CRUD API layer. Supports multipart form data for image uploads.
export const productService = {
  getAll: (params) => axiosInstance.get('/products', { params }),
  getById: (id) => axiosInstance.get(`/products/${id}`),
  create: (formData) =>
    axiosInstance.post('/products', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  update: (id, formData) =>
    axiosInstance.put(`/products/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  remove: (id) => axiosInstance.delete(`/products/${id}`),
  search: (query) => axiosInstance.get('/products/search', { params: { q: query } }),
  lookupByCode: (code) => axiosInstance.get(`/products/lookup/${encodeURIComponent(code)}`),
  getBatches: (id) => axiosInstance.get(`/products/${id}/batches`),
}
