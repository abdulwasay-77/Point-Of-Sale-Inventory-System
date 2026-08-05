
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/db');
const env = require('../../config/env');
const { getEffectivePermissions } = require('../../utils/effectivePermissions');

class AuthService {
  // Generate JWT token
  generateToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        businessId: user.business_id,
      },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );
  }

  // Login user
  async login(email, password, meta = {}) {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }

    // Resolve the business this login belongs to and confirm it's
    // actually usable. Checked with basePrisma (unscoped) since there's
    // no tenant context yet — we're literally in the middle of figuring
    // out which tenant this is.
    const business = await prisma.basePrisma.business.findUnique({ where: { id: user.business_id } });
    if (!business || business.status === 'SUSPENDED') {
      throw new Error('This business account is not active. Please contact support.');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Log successful login attempt
    await prisma.loginAttempt.create({
      data: {
        user_id: user.id,
        email: user.email,
        success: true,
        ip_address: meta.ip_address || null,
        user_agent: meta.user_agent || null
      }
    });

    // Generate token
    const token = this.generateToken(user);
    const permissions = await getEffectivePermissions(user.id);

    // Not every User is an Employee — e.g. the primary admin, or any
    // Admin created without the "paid employee" option, isn't
    // necessarily on payroll/HR. Modules like Staff Expenses (see
    // expenses.service.js#getEmployeeForUser) need to know whether
    // *this* logged-in user has an Employee row behind them before
    // offering "record your own expense" style actions, so we resolve
    // it once here at login rather than every module re-deriving it
    // independently.
    const employee = await prisma.employee.findUnique({
      where: { user_id: user.id },
      select: { id: true },
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isPrimaryAdmin: user.is_primary_admin,
        avatarUrl: user.avatar_url,
        themePreference: user.theme_preference,
        employeeId: employee ? employee.id : null,
        enabledModules: business.enabled_modules,
        permissions,
      }
    };
  }

  // Verify token
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, env.jwtSecret);
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  // Get user by ID
  async getUserById(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        is_active: true,
        created_at: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }
}

module.exports = new AuthService();


