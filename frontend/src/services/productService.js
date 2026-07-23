
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
  getBatches: (id, variantId) => axiosInstance.get(`/products/${id}/batches`, { params: variantId ? { variantId } : {} }),
  generateBarcode: (id) => axiosInstance.post(`/products/${id}/generate-barcode`),
  getVariants: (id) => axiosInstance.get(`/products/${id}/variants`),
  createVariant: (id, data) => axiosInstance.post(`/products/${id}/variants`, data),
  updateVariant: (id, variantId, data) => axiosInstance.put(`/products/${id}/variants/${variantId}`, data),
  removeVariant: (id, variantId) => axiosInstance.delete(`/products/${id}/variants/${variantId}`),
}
