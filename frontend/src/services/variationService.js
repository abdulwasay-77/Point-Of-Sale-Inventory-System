import axiosInstance from './axiosInstance'

// Variation CRUD API layer — reusable variation types (Color, Diameter,
// ...) and their values, managed on their own page and picked from a
// dropdown when adding a product. Mirrors categoryService.js.
export const variationService = {
  getAll: () => axiosInstance.get('/variations'),
  getById: (id) => axiosInstance.get(`/variations/${id}`),
  create: (data) => axiosInstance.post('/variations', data),
  update: (id, data) => axiosInstance.put(`/variations/${id}`, data),
  remove: (id) => axiosInstance.delete(`/variations/${id}`),
  addValue: (variationId, data) => axiosInstance.post(`/variations/${variationId}/values`, data),
  updateValue: (variationId, valueId, data) => axiosInstance.put(`/variations/${variationId}/values/${valueId}`, data),
  removeValue: (variationId, valueId) => axiosInstance.delete(`/variations/${variationId}/values/${valueId}`),
}