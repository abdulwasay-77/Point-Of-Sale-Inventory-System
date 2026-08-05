
import axiosInstance from './axiosInstance'

// Kits & bundles API layer (e.g. a full toilet set sold as one line,
// deducting each component product from stock automatically).
export const kitService = {
  getAll: () => axiosInstance.get('/kits'),
  getById: (id) => axiosInstance.get(`/kits/${id}`),
  create: (data) => axiosInstance.post('/kits', data),
  update: (id, data) => axiosInstance.put(`/kits/${id}`, data),
  remove: (id) => axiosInstance.delete(`/kits/${id}`),
}
