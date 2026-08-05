import platformAxiosInstance from './platformAxiosInstance'

export const platformBusinessService = {
  getAll: () => platformAxiosInstance.get('/businesses'),
  getById: (id) => platformAxiosInstance.get(`/businesses/${id}`),
  create: (payload) => platformAxiosInstance.post('/businesses', payload),
  updateInfo: (id, payload) => platformAxiosInstance.patch(`/businesses/${id}`, payload),
  setStatus: (id, status) => platformAxiosInstance.patch(`/businesses/${id}/status`, { status }),
  setModules: (id, enabledModules) => platformAxiosInstance.patch(`/businesses/${id}/modules`, { enabledModules }),
  setMaxAdminSeats: (id, maxAdminSeats) => platformAxiosInstance.patch(`/businesses/${id}/admin-seats`, { maxAdminSeats }),
  resetAdminPassword: (id, newPassword) => platformAxiosInstance.post(`/businesses/${id}/reset-admin-password`, { newPassword }),
}