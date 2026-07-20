
const prisma = require('../config/db');
const { ROLE_DEFAULTS } = require('../config/permissions');

/**
 * Combines a user's role defaults with their individual overrides:
 * an override with granted=true adds a permission, granted=false removes
 * one the role would normally have.
 */
async function getEffectivePermissions(userId, role) {
  const defaults = new Set(ROLE_DEFAULTS[role] || []);
  const overrides = await prisma.userPermission.findMany({ where: { user_id: userId } });

  for (const override of overrides) {
    if (override.granted) {
      defaults.add(override.permission);
    } else {
      defaults.delete(override.permission);
    }
  }
  return Array.from(defaults);
}

async function userHasPermission(userId, role, permission) {
  const permissions = await getEffectivePermissions(userId, role);
  return permissions.includes(permission);
}

module.exports = { getEffectivePermissions, userHasPermission };
