import axiosInstance from './axiosInstance'

// Dynamic role management API layer (USERS_MANAGE permission only).
// Roles used to be a fixed 4-value enum; now they're rows an admin can
// create/edit/delete here, each with its own permission set.
export const rolesService = {
  getAll: () => axiosInstance.get('/roles'),
  create: (data) => axiosInstance.post('/roles', data),
  update: (id, data) => axiosInstance.put(`/roles/${id}`, data),
  remove: (id) => axiosInstance.delete(`/roles/${id}`),
}