// Helpers for the post-login "redirect to the business's own subdomain"
// behavior (see AuthContext.jsx and TenantHandoffPage.jsx).
//
// VITE_APP_DOMAIN mirrors the backend's APP_DOMAIN (backend/src/config/
// env.js) — they're two separate processes/servers, so each side needs
// its own copy of the same value rather than one somehow inferring it
// from the other. Keep them in sync when the real domain is set.
//
// Left unset, all functions here become safe no-ops: no redirect will
// ever be attempted, which matches today's single-domain behavior.

const APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN || null

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

// True when a redirect to `slug`'s own subdomain is both possible
// (VITE_APP_DOMAIN configured) and necessary (current subdomain
// doesn't already match).
export function needsTenantRedirect(slug) {
  if (!APP_DOMAIN || !slug) return false
  return getCurrentSubdomain() !== slug
}
