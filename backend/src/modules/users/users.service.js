
const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');
const { PERMISSION_CATALOG, ROLE_DEFAULTS } = require('../../config/permissions');
const { getEffectivePermissions } = require('../../utils/effectivePermissions');

class UsersService {
  async getAll() {
    const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
    return users.map(this.toDTO);
  }

  async getById(id) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }
    const permissions = await getEffectivePermissions(user.id, user.role);
    return { ...this.toDTO(user), permissions };
  }

  async create({ name, email, password, role }) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const err = new Error('A user with this email already exists');
      err.status = 409;
      throw err;
    }
    const password_hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password_hash, role },
    });
    return this.toDTO(user);
  }

  async update(id, { name, role, isActive }) {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(role !== undefined && { role }),
        ...(isActive !== undefined && { is_active: isActive }),
      },
    });
    return this.toDTO(user);
  }

  async deactivate(id) {
    const user = await prisma.user.update({ where: { id }, data: { is_active: false } });
    return this.toDTO(user);
  }

  /**
   * Accepts the *desired final* permission set (every key with true/false),
   * diffs it against the user's role defaults, and only stores an override
   * row where it actually differs — anything matching the role default has
   * its override row removed so the table stays a clean "exceptions only"
   * list instead of duplicating every permission for every user.
   */
  async setPermissions(id, desiredPermissions) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }
    const defaults = new Set(ROLE_DEFAULTS[user.role] || []);

    await prisma.$transaction(async (tx) => {
      for (const { key, enabled } of desiredPermissions) {
        const isDefault = defaults.has(key);
        if (enabled === isDefault) {
          // Matches the role default — no override needed.
          await tx.userPermission.deleteMany({ where: { user_id: id, permission: key } });
        } else {
          await tx.userPermission.upsert({
            where: { user_id_permission: { user_id: id, permission: key } },
            create: { user_id: id, permission: key, granted: enabled },
            update: { granted: enabled },
          });
        }
      }
    });

    return this.getById(id);
  }

  getPermissionCatalog() {
    return { catalog: PERMISSION_CATALOG, roleDefaults: ROLE_DEFAULTS };
  }

  toDTO(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
      createdAt: user.created_at,
    };
  }
}

module.exports = new UsersService();
