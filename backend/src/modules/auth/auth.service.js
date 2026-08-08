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
    const userPayload = await this.buildUserResponse(user, business);

    return {
      token,
      user: userPayload,
    };
  }

  // Builds the exact same "full" user shape used by the login response —
  // id, role, enabledModules, permissions, etc. Shared by login() and
  // getUserById() so GET /api/auth/me can never drift out of sync with
  // what login() returns. `business`, if already fetched by the caller,
  // is reused; otherwise it's looked up here.
  //
  // This matters because enabledModules/permissions are otherwise only
  // ever set ONCE, at login, and cached client-side (see AuthContext.jsx)
  // — if a Super Admin changes a business's enabled modules or someone's
  // role permissions change, an already-logged-in user's sidebar won't
  // reflect it until this gets re-fetched. getUserById() is what
  // GET /api/auth/me calls, and the frontend now calls that
  // periodically/on focus specifically to pick this up without forcing
  // a full re-login.
  async buildUserResponse(user, business = null) {
    const resolvedBusiness =
      business || (await prisma.basePrisma.business.findUnique({ where: { id: user.business_id } }));

    const permissions = await getEffectivePermissions(user.id);

    // Not every User is an Employee — e.g. the primary admin, or any
    // Admin created without the "paid employee" option, isn't
    // necessarily on payroll/HR. Modules like Staff Expenses (see
    // expenses.service.js#getEmployeeForUser) need to know whether
    // *this* logged-in user has an Employee row behind them before
    // offering "record your own expense" style actions, so we resolve
    // it once here rather than every module re-deriving it independently.
    const employee = await prisma.employee.findUnique({
      where: { user_id: user.id },
      select: { id: true },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isPrimaryAdmin: user.is_primary_admin,
      avatarUrl: user.avatar_url,
      themePreference: user.theme_preference,
      employeeId: employee ? employee.id : null,
      enabledModules: resolvedBusiness ? resolvedBusiness.enabled_modules : [],
      permissions,
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
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }

    return this.buildUserResponse(user);
  }
}

module.exports = new AuthService();