import axiosInstance from './axiosInstance'

// Website Settings — single business record, plus the backup export.
export const settingsService = {
  get: () => axiosInstance.get('/settings'),
  // Unauthenticated — companyName/logoUrl only. Used by the Login page,
  // which runs before there's a token to attach to the request.
  getPublic: () => axiosInstance.get('/settings/public'),
  update: (data) => axiosInstance.put('/settings', data),
  updateLogo: (formData) =>
    axiosInstance.post('/settings/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  removeLogo: () => axiosInstance.delete('/settings/logo'),
  // Returns a raw file blob (not the usual { data: ... } JSON envelope) —
  // see SettingsPage.jsx for how the download is triggered from this.
  downloadBackup: (format) => axiosInstance.get('/settings/backup', { params: { format }, responseType: 'blob' }),
}