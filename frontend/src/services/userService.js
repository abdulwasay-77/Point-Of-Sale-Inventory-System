
import axiosInstance from './axiosInstance'

// User & role management API layer (admin / USERS_MANAGE permission only).
export const userService = {
  getAll: () => axiosInstance.get('/users'),
  getById: (id) => axiosInstance.get(`/users/${id}`),
  create: (data) => axiosInstance.post('/users', data),
  update: (id, data) => axiosInstance.put(`/users/${id}`, data),
  deactivate: (id) => axiosInstance.delete(`/users/${id}`),
  getPermissionCatalog: () => axiosInstance.get('/users/permissions/catalog'),
  setPermissions: (id, permissions) => axiosInstance.put(`/users/${id}/permissions`, { permissions }),
}
