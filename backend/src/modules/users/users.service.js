const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');
const { PERMISSION_CATALOG, filterCatalogForModules } = require('../../config/permissions');
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
    const permissions = await getEffectivePermissions(user.id);
    return { ...this.toDTO(user), permissions };
  }

  /**
   * Confirms a role name exists before we let the database's foreign key
   * be the one to reject it — a friendly 400 here beats a raw Prisma
   * constraint-violation error bubbling up from create/update.
   */
  async assertRoleExists(roleName) {
    const role = await prisma.role.findFirst({ where: { name: roleName } });
    if (!role) {
      const err = new Error(`"${roleName}" isn't a valid role. Check Manage Roles for the current list.`);
      err.status = 400;
      throw err;
    }
    return role;
  }

  /**
   * Throws if `id` belongs to the primary admin — the one account
   * nobody but a future Super Admin can edit, deactivate, reassign, or
   * strip permissions from (see User.is_primary_admin in schema.prisma).
   * Called at the top of update()/deactivate()/setPermissions() so every
   * one of those actions is blocked the same way, with the same message.
   */
  async assertNotPrimaryAdmin(id, actionDescription) {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }
    if (target.is_primary_admin) {
      const err = new Error(`This account can't be ${actionDescription} by another user.`);
      err.status = 403;
      throw err;
    }
    return target;
  }

  /**
   * Plain "add a login" — used by User Management. `employee` is
   * optional here regardless of role: pass an object (even {}) to also
   * create a linked HR/payroll record, or omit it / pass null to create
   * just a login with no payroll footprint — e.g. a business partner
   * given full Admin rights who isn't actually paid a salary through
   * this system. See createUser() below for why this decision isn't
   * tied to role at all.
   */
  async create({ name, email, password, role, employee }) {
    const { user } = await this.createUser({ name, email, password, role, employee: employee || null });
    return this.toDTO(user);
  }

  /**
   * Creates a User and, optionally, its linked Employee/HR record, in
   * one transaction. Both User Management's "Add User" and Payroll's
   * "Add Employee" (when creating a new login, rather than linking an
   * existing one or going payroll-only) call this, so the two flows can
   * never drift apart.
   *
   * Whether an Employee record gets created is entirely up to the
   * caller (`employee: null` skips it) — it is NOT decided by role.
   * Two Admins created by the same business can be completely different
   * situations: a hired store manager who's genuinely on payroll, or a
   * business partner/co-owner who isn't paid a salary through this
   * system at all. Forcing one or the other based on role would get
   * either case wrong.
   *
   * Returns raw prisma rows ({ user, employeeRecord }) rather than
   * DTOs, so each caller can format the part it cares about with its own
   * DTO shape (UsersService.toDTO vs PayrollService.employeeDTO).
   */
  async createUser({ name, email, password, role, employee = null }) {
    await this.assertRoleExists(role);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const err = new Error('A user with this email already exists');
      err.status = 409;
      throw err;
    }
    const password_hash = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, password_hash, role },
      });

      let employeeRecord = null;
      if (employee) {
        employeeRecord = await tx.employee.create({
          data: {
            user_id: user.id,
            name: user.name,
            role_title: employee.roleTitle || '',
            base_salary: employee.baseSalary !== undefined && employee.baseSalary !== '' ? Number(employee.baseSalary) : 0,
            commission_rate:
              employee.commissionRate !== undefined && employee.commissionRate !== ''
                ? Number(employee.commissionRate)
                : null,
            contact_phone: employee.contactPhone || null,
            address: employee.address || null,
            hire_date: employee.hireDate ? new Date(employee.hireDate) : new Date(),
          },
        });
      }
      return { user, employeeRecord };
    });

    return result;
  }

  /**
   * A user editing their OWN account from User Management is blocked
   * entirely, not just the isActive:false case — changing your own role
   * (e.g. to one without USERS_MANAGE) is just as capable of locking you
   * out as deactivating yourself, with no other admin able to undo it if
   * you're the only one. Personal details (name, avatar, theme, etc.)
   * still go through the separate Profile page, which isn't gated by
   * this check.
   *
   * Also entirely blocked, for anyone, if the TARGET is the primary
   * admin — see assertNotPrimaryAdmin() above.
   */
  async update(id, { name, role, isActive }, currentUserId) {
    if (currentUserId && String(id) === String(currentUserId)) {
      const err = new Error('You cannot edit your own account while logged in. Use your Profile page for personal details.');
      err.status = 400;
      throw err;
    }
    await this.assertNotPrimaryAdmin(id, 'edited');

    if (role !== undefined) {
      await this.assertRoleExists(role);
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(role !== undefined && { role }),
          ...(isActive !== undefined && { is_active: isActive }),
        },
      });
      if (isActive !== undefined) {
        await tx.employee.updateMany({
          where: { user_id: id },
          data: { is_active: isActive },
        });
      }
      return updated;
    });

    return this.toDTO(user);
  }

  async deactivate(id, currentUserId) {
    if (currentUserId && String(id) === String(currentUserId)) {
      const err = new Error('You cannot deactivate your own account while logged in.');
      err.status = 400;
      throw err;
    }
    await this.assertNotPrimaryAdmin(id, 'deactivated');

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: { is_active: false } });
      await tx.employee.updateMany({
        where: { user_id: id },
        data: { is_active: false },
      });
      return updated;
    });

    return this.toDTO(user);
  }

  /**
   * Accepts the *desired final* permission set (every key with true/false),
   * diffs it against the user's role's permission set (looked up from
   * the roles/role_permissions tables — see roles.service.js), and only
   * stores an override row where it actually differs — anything matching
   * the role's own permissions has its override row removed so the
   * table stays a clean "exceptions only" list instead of duplicating
   * every permission for every user.
   *
   * Blocked entirely for your own account (same lockout risk as editing
   * your own role) and for the primary admin's account, for anyone —
   * see assertNotPrimaryAdmin() above.
   */
  async setPermissions(id, desiredPermissions, currentUserId) {
    if (currentUserId && String(id) === String(currentUserId)) {
      const err = new Error('You cannot change your own permissions while logged in.');
      err.status = 400;
      throw err;
    }
    const user = await this.assertNotPrimaryAdmin(id, 'have its permissions overridden');

    const role = await prisma.role.findFirst({ where: { name: user.role }, include: { permissions: true } });
    const defaults = new Set((role?.permissions || []).map((p) => p.permission));

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

  // enabledModules comes from the current business (req.business.enabled_modules
  // — see users.controller.js). Filters out permissions for modules the
  // business's plan doesn't include, so the "Add Role" and per-user
  // Permissions checkbox grids never offer a permission that would do
  // nothing anyway (authMiddleware.js's module gate blocks the
  // underlying routes regardless — this just keeps the UI honest about it).
  getPermissionCatalog(enabledModules = []) {
    return { catalog: filterCatalogForModules(PERMISSION_CATALOG, enabledModules) };
  }

  toDTO(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isPrimaryAdmin: user.is_primary_admin,
      isActive: user.is_active,
      createdAt: user.created_at,
    };
  }
}

module.exports = new UsersService();