
const prisma = require('../config/db');
const { PERMISSIONS } = require('../config/permissions');

/**
 * Combines a role's DEFAULT permission set (stored in the roles /
 * role_permissions tables — see roles.service.js) with the user's
 * individual overrides: an override with granted=true adds a permission,
 * granted=false removes one the role would normally have.
 *
 * The primary admin (User.is_primary_admin — see schema.prisma) is a
 * hard exception: their access is never derived from a role at all, so
 * it short-circuits here before any Role/RolePermission lookup happens.
 * This is deliberate — it means their access survives even if their
 * role gets renamed, edited down to nothing, or deleted entirely by
 * someone else, because there's structurally nothing to strip.
 *
 * Takes just a userId (not a cached role name from a JWT) and looks the
 * user up fresh each call, so a role rename or permission edit is
 * reflected immediately rather than only after the user's token expires.
 */
async function getEffectivePermissions(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, is_primary_admin: true, business_id: true },
  });
  if (!user) return [];

  if (user.is_primary_admin) {
    return Object.values(PERMISSIONS);
  }

  if (!user.role) return [];

  // Scoped explicitly by business_id here rather than relying on the
  // ambient tenant context (config/db.js) — this function also runs
  // during login, before that context exists, and Role.name is only
  // unique per business (e.g. two different businesses can each have
  // their own role called "Cashier"), so an unscoped lookup could
  // silently resolve to the wrong business's role.
  const [roleRecord, overrides] = await Promise.all([
    prisma.role.findFirst({ where: { name: user.role, business_id: user.business_id }, include: { permissions: true } }),
    prisma.userPermission.findMany({ where: { user_id: userId, business_id: user.business_id } }),
  ]);

  const defaults = new Set((roleRecord?.permissions || []).map((p) => p.permission));

  for (const override of overrides) {
    if (override.granted) {
      defaults.add(override.permission);
    } else {
      defaults.delete(override.permission);
    }
  }
  return Array.from(defaults);
}

async function userHasPermission(userId, permission) {
  const permissions = await getEffectivePermissions(userId);
  return permissions.includes(permission);
}

module.exports = { getEffectivePermissions, userHasPermission };

