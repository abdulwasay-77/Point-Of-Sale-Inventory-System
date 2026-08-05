const prisma = require('../config/db');
const { getCurrentBusinessId } = require('../config/db');

/**
 * One BusinessSettings row per business (see schema.prisma) — this
 * get-or-creates it so every caller (checkout, the Settings page, etc.)
 * can rely on it always existing, without every caller needing its own
 * "does the row exist yet" check.
 *
 * Was previously a single fixed-id singleton row (id: 'business_settings')
 * from before multi-tenancy — that broke the instant a second business
 * existed (findUnique by that literal id would never match a real
 * per-business row, and create() would try to reuse that same literal
 * id as the primary key for every business, colliding on the second
 * one). Now keyed by business_id, which the tenant-scoping extension
 * (config/db.js) still handles automatically for the create() call.
 *
 * Requires an active tenant context (a logged-in request). The one
 * caller that runs WITHOUT one — the public pre-login branding endpoint
 * (GET /api/settings/public) — must NOT call this; there is no way to
 * know which business's settings to return on a shared, not-yet-
 * subdomain-routed login page. See SettingsService#getPublicSettings,
 * which returns safe generic defaults instead.
 */
async function getBusinessSettings() {
  const businessId = getCurrentBusinessId();
  if (!businessId) {
    const err = new Error('getBusinessSettings() called with no active business context — see the function comment above.');
    err.status = 500;
    throw err;
  }
  const existing = await prisma.businessSettings.findUnique({ where: { business_id: businessId } });
  if (existing) return existing;
  return prisma.businessSettings.create({ data: {} }); // business_id injected by the tenant-scoping extension
}

module.exports = { getBusinessSettings };