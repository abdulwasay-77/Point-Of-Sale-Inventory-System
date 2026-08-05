// Backend image paths (avatar_url, logo_url, product image_url) are all
// stored as root-relative paths like "/uploads/avatars/xyz.jpg" — this
// resolves them against the API's origin (stripping the trailing /api)
// so an <img> tag can actually load them regardless of environment.
export function toAssetUrl(path) {
  if (!path) return null
  if (path.startsWith('http') || path.startsWith('blob:')) return path
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
  return `${apiBase.replace(/\/api$/, '')}${path}`
}
