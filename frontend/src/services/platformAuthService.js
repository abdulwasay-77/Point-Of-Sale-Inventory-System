import platformAxiosInstance from './platformAxiosInstance'

export const platformAuthService = {
  login: (credentials) => platformAxiosInstance.post('/auth/login', credentials),
  me: () => platformAxiosInstance.get('/auth/me'),
}
