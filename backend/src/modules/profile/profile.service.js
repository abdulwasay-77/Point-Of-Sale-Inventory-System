const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');

/**
 * Profile — always scoped to the CURRENT logged-in user (req.user.userId
 * from the auth token), never another user's id. There's no "edit
 * someone else's profile" endpoint here on purpose — an admin managing
 * another employee's salary/role does that through the Payroll module
 * instead (see payroll.service.js#updateEmployee), which is a
 * deliberately different, permission-gated action from self-service
 * profile editing.
 */
class ProfileService {
  async getProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true },
    });
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(user);
  }

  /**
   * Editable fields only: name, email, contact_phone, address. Anything
   * admin-managed (salary, commission rate, role title, hire date) is
   * simply not accepted here — see the Employee model comment in
   * schema.prisma on why name is kept in sync on both User and Employee
   * when a login is linked.
   */
  async updateProfile(userId, data) {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { employee: true } });
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }

    if (data.email !== undefined && data.email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing) {
        const err = new Error('That email is already in use.');
        err.status = 409;
        throw err;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.email !== undefined && { email: data.email }),
          ...(data.contact_phone !== undefined && { contact_phone: data.contact_phone }),
          ...(data.address !== undefined && { address: data.address }),
        },
      });
      // Keep Employee.name in sync when this user has a linked HR record
      // (see the comment on Employee.name in schema.prisma) — it's the
      // one field that legitimately lives on both.
      if (user.employee && data.name !== undefined) {
        await tx.employee.update({ where: { id: user.employee.id }, data: { name: data.name } });
      }
      if (user.employee && (data.contact_phone !== undefined || data.address !== undefined)) {
        await tx.employee.update({
          where: { id: user.employee.id },
          data: {
            ...(data.contact_phone !== undefined && { contact_phone: data.contact_phone }),
            ...(data.address !== undefined && { address: data.address }),
          },
        });
      }
    });

    return this.getProfile(userId);
  }

  async updateAvatar(userId, imageFile) {
    if (!imageFile) {
      const err = new Error('No image uploaded');
      err.status = 400;
      throw err;
    }
    await prisma.user.update({
      where: { id: userId },
      data: { avatar_url: `/uploads/avatars/${imageFile.filename}` },
    });
    return this.getProfile(userId);
  }

  /** Clears the avatar back to null — ProfilePage then falls back to the
   *  initials badge, same as an account that never uploaded one. */
  async removeAvatar(userId) {
    await prisma.user.update({ where: { id: userId }, data: { avatar_url: null } });
    return this.getProfile(userId);
  }

  async updateTheme(userId, theme) {
    if (theme !== 'LIGHT' && theme !== 'DARK') {
      const err = new Error('Theme must be LIGHT or DARK.');
      err.status = 400;
      throw err;
    }
    await prisma.user.update({ where: { id: userId }, data: { theme_preference: theme } });
    return { theme };
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    if (!newPassword || newPassword.length < 8) {
      const err = new Error('New password must be at least 8 characters.');
      err.status = 400;
      throw err;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const isValid = await bcrypt.compare(currentPassword || '', user.password_hash);
    if (!isValid) {
      const err = new Error('Current password is incorrect.');
      err.status = 401;
      throw err;
    }
    const password_hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { password_hash } });
  }

  toDTO(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatar_url,
      contactPhone: user.contact_phone,
      address: user.address,
      themePreference: user.theme_preference,
      // Admin-managed, read-only from this module's point of view.
      employee: user.employee
        ? {
            roleTitle: user.employee.role_title,
            baseSalary: Number(user.employee.base_salary),
            commissionRate: user.employee.commission_rate !== null ? Number(user.employee.commission_rate) : null,
            hireDate: user.employee.hire_date,
            isActive: user.employee.is_active,
          }
        : null,
    };
  }
}

module.exports = new ProfileService();