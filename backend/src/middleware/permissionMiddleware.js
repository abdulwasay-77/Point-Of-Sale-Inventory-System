
const { userHasPermission } = require('../utils/effectivePermissions');

/**
 * Route guard for the granular permission system (see config/permissions.js).
 * Must run after authMiddleware (needs req.user.userId + req.user.role).
 * A route can require any ONE of several permissions by passing an array —
 * that's an OR, not an AND (e.g. a route usable by either an accountant
 * or an admin permission).
 */
function permissionMiddleware(requiredPermissions) {
  const required = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      for (const permission of required) {
        // eslint-disable-next-line no-await-in-loop
        if (await userHasPermission(req.user.userId, req.user.role, permission)) {
          return next();
        }
      }

      return res.status(403).json({
        success: false,
        message: "You don't have permission to perform this action",
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = permissionMiddleware;
