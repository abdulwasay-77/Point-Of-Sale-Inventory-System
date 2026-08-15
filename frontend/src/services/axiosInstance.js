import axios from 'axios'
import { emitApiError } from '../utils/errorBus'

// Base URL for the backend API.
//
// Subdomain-based multi-tenancy (see backend/src/middleware/
// tenantMiddleware.js) identifies a business from the HOST HEADER of
// the request that actually reaches the backend — not from anything
// in the request body or a token. That means it's critical that a
// browser sitting on alimobiles.pos.com sends its API calls to
// alimobiles.pos.com too (or whatever port/host the backend for that
// subdomain answers on) — hardcoding a single fixed API domain here
// would silently break tenant resolution, because every business's
// frontend would end up hitting the same Host header no matter which
// subdomain the user actually visited.
//
// Two ways to configure this:
//  1. VITE_API_BASE_URL — a full explicit override. Use this if the
//     API genuinely lives on a separate domain from the frontend (in
//     which case that separate domain needs its own way to learn the
//     tenant, e.g. also being wildcard-routed).
//  2. Otherwise, infer it from whatever hostname the browser is
//     currently on, so it automatically matches the subdomain — this
//     is the default and the one that "just works" with the
//     reverse-proxy setup described alongside tenantMiddleware.js.
//     VITE_API_PORT controls the inferred URL's port: unset defaults
//     to 5000 (matches local `npm run dev`, same as the old hardcoded
//     default below); set VITE_API_PORT="" in production if the API is
//     reverse-proxied on the same origin/port as the frontend (no
//     separate port at all).
const configuredPort = import.meta.env.VITE_API_PORT
const inferredPort = configuredPort === undefined ? '5000' : configuredPort
const inferredBaseURL = `${window.location.protocol}//${window.location.hostname}${
  inferredPort ? `:${inferredPort}` : ''
}/api`

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || inferredBaseURL

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