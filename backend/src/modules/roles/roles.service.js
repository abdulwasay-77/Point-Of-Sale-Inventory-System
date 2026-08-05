const prisma = require('../../config/db');
const { PERMISSIONS } = require('../../config/permissions');

const VALID_PERMISSION_KEYS = new Set(Object.values(PERMISSIONS));

// Fully dynamic roles — there is no "built-in" role of any kind (see
// schema.prisma). Every role, without exception, is created, renamed,
// re-permissioned, and deleted the exact same way, through this
// service. Protection against a business losing the ability to manage
// itself doesn't live here at all anymore — it lives on
// User.is_primary_admin (see users.service.js#assertNotPrimaryAdmin),
// which is untouchable regardless of what happens to any role.
class RolesService {
  async getAll() {
    const roles = await prisma.role.findMany({
      include: { permissions: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
    return roles.map(this.toDTO);
  }

  /**
   * New roles start with ZERO permissions on purpose — an admin grants
   * exactly what the role needs from the catalog rather than inheriting
   * anything by accident. Silently drops any key in `permissions` that
   * isn't in the fixed PERMISSIONS catalog, rather than erroring, so a
   * stale/garbage key from the client can't end up stored.
   */
  async create({ name, permissions = [] }) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      const err = new Error('Role name is required.');
      err.status = 400;
      throw err;
    }
    const existing = await prisma.role.findFirst({ where: { name: trimmed } });
    if (existing) {
      const err = new Error(`A role named "${trimmed}" already exists.`);
      err.status = 409;
      throw err;
    }
    const validPermissions = permissions.filter((p) => VALID_PERMISSION_KEYS.has(p));

    // Deliberately NOT a single `prisma.role.create({ data: { permissions:
    // { create: [...] } } } })` — the tenant-scoping extension (see
    // config/db.js) only injects business_id onto the top-level model of
    // a query; a nested relation write like `permissions: { create: [...]
    // } }` creates RolePermission rows the extension never sees as their
    // own operation, so they'd be written with no business_id at all
    // (that column is NOT NULL — this is what broke role creation after
    // multi-tenancy landed). Instead: create the Role, then create its
    // permissions with their own top-level `rolePermission.createMany()`
    // call — same pattern update() below already used. Wrapped in a
    // transaction purely for atomicity.
    const role = await prisma.$transaction(async (tx) => {
      const createdRole = await tx.role.create({ data: { name: trimmed } });
      if (validPermissions.length) {
        await tx.rolePermission.createMany({
          data: validPermissions.map((permission) => ({ role_id: createdRole.id, permission })),
        });
      }
      return createdRole;
    });
    return this.getById(role.id);
  }

  /**
   * Renames and/or replaces the permission set for a role. Every role
   * can be edited this way now — there's nothing "built-in" left to
   * protect (see class comment above).
   */
  async update(id, { name, permissions }) {
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      const err = new Error('Role not found');
      err.status = 404;
      throw err;
    }

    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) {
        const err = new Error('Role name is required.');
        err.status = 400;
        throw err;
      }
      const conflict = await prisma.role.findFirst({ where: { name: trimmed } });
      if (conflict && conflict.id !== id) {
        const err = new Error(`A role named "${trimmed}" already exists.`);
        err.status = 409;
        throw err;
      }
    }

    await prisma.$transaction(async (tx) => {
      if (name !== undefined) {
        // onUpdate: Cascade on User.roleRef means every user holding
        // this role is repointed to the new name automatically.
        await tx.role.update({ where: { id }, data: { name: name.trim() } });
      }
      if (permissions !== undefined) {
        const validPermissions = permissions.filter((p) => VALID_PERMISSION_KEYS.has(p));
        await tx.rolePermission.deleteMany({ where: { role_id: id } });
        if (validPermissions.length) {
          await tx.rolePermission.createMany({
            data: validPermissions.map((permission) => ({ role_id: id, permission })),
          });
        }
      }
    });

    return this.getById(id);
  }

  async remove(id) {
    const role = await prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) {
      const err = new Error('Role not found');
      err.status = 404;
      throw err;
    }
    if (role._count.users > 0) {
      const err = new Error(
        `Cannot delete — ${role._count.users} user(s) still have this role. Reassign them to a different role first.`
      );
      err.status = 409;
      throw err;
    }
    await prisma.role.delete({ where: { id } });
  }

  async getById(id) {
    const role = await prisma.role.findUnique({
      where: { id },
      include: { permissions: true, _count: { select: { users: true } } },
    });
    if (!role) {
      const err = new Error('Role not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(role);
  }

  toDTO(role) {
    return {
      id: role.id,
      name: role.name,
      permissions: role.permissions.map((p) => p.permission),
      userCount: role._count?.users ?? 0,
    };
  }
}

module.exports = new RolesService();