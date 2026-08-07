
import axiosInstance from './axiosInstance'

// Unit of Measure CRUD API layer — business-managed list replacing the
// old fixed UomType enum. Mirrors variationService.js.
export const unitService = {
  getAll: () => axiosInstance.get('/units-of-measure'),
  create: (data) => axiosInstance.post('/units-of-measure', data),
  update: (id, data) => axiosInstance.put(`/units-of-measure/${id}`, data),
  remove: (id) => axiosInstance.delete(`/units-of-measure/${id}`),
}
