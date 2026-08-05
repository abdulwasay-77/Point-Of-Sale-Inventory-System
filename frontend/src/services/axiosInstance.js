
import axios from 'axios'
import { emitApiError } from '../utils/errorBus'

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

// Centralized response handling:
//  - 401 Unauthorized -> redirect to login (unchanged, existing behavior).
//  - Every other failed request -> surface it in the GlobalErrorModal
//    (see errorBus.js) so any create/edit/delete action anywhere in the
//    app gets a consistent, always-on-top error popup without every
//    page needing its own try/catch just to display one.
//
// Opt-out: pass `{ skipGlobalError: true }` as part of a request's
// config (see authService.js's login call and salesService.js's
// checkout call) for the couple of flows that intentionally keep their
// own inline error text instead of the popup — see GlobalErrorModal.jsx
// for why those two are the exception.
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pos_token')
      localStorage.removeItem('pos_user')
      // Full reload so all context state resets cleanly.
      window.location.href = '/login'
      return Promise.reject(error)
    }

    if (!error.config?.skipGlobalError) {
      const message =
        error.response?.data?.message ||
        (error.request && !error.response
          ? 'Could not reach the server. Check your connection and try again.'
          : 'Something went wrong. Please try again.')
      emitApiError(message)
    }

    return Promise.reject(error)
  },
)

export default axiosInstance
