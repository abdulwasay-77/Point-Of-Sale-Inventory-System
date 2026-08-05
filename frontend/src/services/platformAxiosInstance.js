

import axios from 'axios'

// Completely separate axios instance from axiosInstance.js — different
// localStorage key (platform_token vs pos_token) and a different 401
// redirect (/platform/login vs /login), so a tenant session and a
// platform session can never collide or leak into each other in the
// same browser.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

const platformAxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/platform`,
  headers: { 'Content-Type': 'application/json' },
})

platformAxiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('platform_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

platformAxiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('platform_token')
      localStorage.removeItem('platform_admin')
      window.location.href = '/platform/login'
    }
    return Promise.reject(error)
  },
)

export default platformAxiosInstance
