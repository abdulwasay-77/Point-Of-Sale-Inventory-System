
import axiosInstance from './axiosInstance'

// Category CRUD API layer.
export const categoryService = {
  getAll: () => axiosInstance.get('/categories'),
  getById: (id) => axiosInstance.get(`/categories/${id}`),
  create: (data) => axiosInstance.post('/categories', data),
  update: (id, data) => axiosInstance.put(`/categories/${id}`, data),
  remove: (id) => axiosInstance.delete(`/categories/${id}`),
}
