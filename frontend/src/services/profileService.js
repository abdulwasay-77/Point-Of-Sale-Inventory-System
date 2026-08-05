import axiosInstance from './axiosInstance'

// Profile — always the CURRENT logged-in user, never takes an id.
export const profileService = {
  get: () => axiosInstance.get('/profile'),
  update: (data) => axiosInstance.put('/profile', data),
  updateAvatar: (formData) =>
    axiosInstance.post('/profile/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  removeAvatar: () => axiosInstance.delete('/profile/avatar'),
  updateTheme: (theme) => axiosInstance.put('/profile/theme', { theme }),
  changePassword: (currentPassword, newPassword) =>
    axiosInstance.post('/profile/change-password', { currentPassword, newPassword }),
}