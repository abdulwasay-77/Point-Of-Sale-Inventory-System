// Helpers for the post-login "redirect to the business's own subdomain"
// behavior (see AuthContext.jsx and TenantHandoffPage.jsx).
//
// VITE_APP_DOMAIN mirrors the backend's APP_DOMAIN (backend/src/config/
// env.js) — they're two separate processes/servers, so each side needs
// its own copy of the same value rather than one somehow inferring it
// from the other. Keep them in sync when the real domain is set.
//
// VITE_PLATFORM_SUBDOMAIN mirrors the backend's PLATFORM_SUBDOMAIN.
// Default is "platformadmin". Keep it in sync with backend/.env.
//
// Left unset, all functions here become safe no-ops: no redirect will
// ever be attempted, which matches today's single-domain behavior.

const APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN || null
const PLATFORM_SUBDOMAIN = import.meta.env.VITE_PLATFORM_SUBDOMAIN || 'platformadmin'

const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'platform', 'app', PLATFORM_SUBDOMAIN])

// The subdomain segment of the current hostname, or null if the app is
// on the bare domain, on a domain that doesn't match VITE_APP_DOMAIN at
// all (e.g. plain "localhost" during ordinary local dev), or
// VITE_APP_DOMAIN isn't configured.
export function getCurrentSubdomain() {
  if (!APP_DOMAIN) return null
  const hostname = window.location.hostname
  const suffix = `.${APP_DOMAIN}`
  if (hostname === APP_DOMAIN || !hostname.endsWith(suffix)) return null
  const sub = hostname.slice(0, -suffix.length)
  if (!sub || sub.includes('.')) return null // dotted (e.g. the owner subdomain) — not a business slug
  return sub
}

// True if currently visiting a tenant's specific business subdomain (not reserved)
export function isTenantSubdomain() {
  const sub = getCurrentSubdomain()
  return !!sub && !RESERVED_SUBDOMAINS.has(sub)
}

// True if currently on the dedicated platform admin subdomain
// (e.g. platformadmin.localhost or platformadmin.pos.com)
export function isPlatformSubdomain() {
  const sub = getCurrentSubdomain()
  return sub === PLATFORM_SUBDOMAIN
}

// Full origin (protocol + host + optional port) for a given business
// slug, preserving whatever port the app is currently running on (so
// this works the same in local dev, where the frontend runs on a
// non-default port, and in production, where it typically won't).
export function buildTenantOrigin(slug) {
  if (!APP_DOMAIN || !slug) return null
  const { protocol, port } = window.location
  const portSuffix = port ? `:${port}` : ''
  return `${protocol}//${slug}.${APP_DOMAIN}${portSuffix}`
}

// Generates the full URL for a business login/portal
export function getTenantLoginUrl(slug) {
  const origin = buildTenantOrigin(slug)
  if (!origin) {
    const { protocol, host } = window.location
    return `${protocol}//${host}/login`
  }
  return `${origin}/login`
}

// Generates the bare root domain URL (e.g. http://localhost:5173/login)
export function buildBareDomainUrl(path = '/login') {
  const { protocol, port } = window.location
  const domain = APP_DOMAIN || window.location.hostname
  const portSuffix = port ? `:${port}` : ''
  return `${protocol}//${domain}${portSuffix}${path}`
}

// Generates the platform admin portal URL
// e.g. http://platformadmin.localhost:5173/platform/login
export function buildPlatformUrl(path = '/platform/login') {
  const { protocol, port } = window.location
  const portSuffix = port ? `:${port}` : ''
  if (APP_DOMAIN) {
    return `${protocol}//${PLATFORM_SUBDOMAIN}.${APP_DOMAIN}${portSuffix}${path}`
  }
  return `${protocol}//${window.location.hostname}${portSuffix}${path}`
}

// True when a redirect to `slug`'s own subdomain is both possible
// (VITE_APP_DOMAIN configured) and necessary (current subdomain
// doesn't already match).
export function needsTenantRedirect(slug) {
  if (!APP_DOMAIN || !slug) return false
  return getCurrentSubdomain() !== slug
}
