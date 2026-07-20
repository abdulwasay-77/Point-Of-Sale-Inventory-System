
import axios from 'axios'

// Base URL for the backend API. Set VITE_API_BASE_URL in a .env file when
// the backend is available. Defaults to a local Express server on port 5000.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Attach the JWT (if present) to every outgoing request.
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('pos_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Centralized response handling — redirect to login on 401 Unauthorized.
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pos_token')
      localStorage.removeItem('pos_user')
      // Full reload so all context state resets cleanly.
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default axiosInstance
