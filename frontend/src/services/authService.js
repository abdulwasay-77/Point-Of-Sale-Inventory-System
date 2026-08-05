
import axiosInstance from './axiosInstance'

// Auth API layer. Backend routes are not implemented yet — these calls will
// work as soon as the Express /api/auth routes exist.
export const authService = {
  // skipGlobalError: LoginPage has its own inline "Invalid email or
  // password" text right under the form — a failed login is an
  // expected, everyday outcome there, not the kind of surprising error
  // the GlobalErrorModal popup is for. See GlobalErrorModal.jsx.
  login: (credentials) => axiosInstance.post('/auth/login', credentials, { skipGlobalError: true }),
  logout: () => axiosInstance.post('/auth/logout'),
  getProfile: () => axiosInstance.get('/auth/me'),
}
