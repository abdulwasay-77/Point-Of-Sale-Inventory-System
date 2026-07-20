
import axiosInstance from './axiosInstance'

// Auth API layer. Backend routes are not implemented yet — these calls will
// work as soon as the Express /api/auth routes exist.
export const authService = {
  login: (credentials) => axiosInstance.post('/auth/login', credentials),
  logout: () => axiosInstance.post('/auth/logout'),
  getProfile: () => axiosInstance.get('/auth/me'),
}
