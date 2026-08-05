

const AuthService = require('./auth.service');
const UsersService = require('../users/users.service');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class AuthController {
  // Login handler
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      try {
        const result = await AuthService.login(email, password, {
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.headers['user-agent'],
        });

        return res.json({
          success: true,
          message: 'Login successful',
          data: result
        });
      } catch (loginError) {
        // Only the failed-attempt case needs a manual audit row here —
        // AuthService.login already logs the successful case itself.
        await prisma.loginAttempt.create({
          data: {
            email,
            success: false,
            ip_address: req.ip || req.connection.remoteAddress,
            user_agent: req.headers['user-agent']
          }
        });
        throw loginError;
      }

    } catch (error) {
      next(error);
    }
  }

  // Register handler — kept only for compatibility, prefer POST
  // /api/users directly. Delegates to UsersService.create so this path
  // can never drift from the real one: same role validation, same
  // optional-Employee behavior, same primary-admin protections. There's
  // no hardcoded fallback role here on purpose — a role is a real
  // decision, not something to default silently, especially now that
  // there's no "SALES_STAFF" guaranteed to exist.
  async register(req, res, next) {
    try {
      const { name, email, password, role, employee } = req.body;

      if (!name || !email || !password || !role) {
        return res.status(400).json({
          success: false,
          message: 'name, email, password and role are required'
        });
      }

      const user = await UsersService.create({ name, email, password, role, employee });

      await prisma.auditLog.create({
        data: {
          user_id: req.user?.userId,
          action: 'CREATE_USER',
          entity_type: 'User',
          entity_id: user.id,
          changes: { email: user.email, role: user.role }
        }
      });

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: user
      });

    } catch (error) {
      next(error);
    }
  }

  // Logout handler — JWTs are stateless, so there's nothing to invalidate
  // server-side; this just gives the frontend a real endpoint to call.
  async logout(req, res, next) {
    try {
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }

  // Get current user profile
  async me(req, res, next) {
    try {
      const userId = req.user?.userId;
      const user = await AuthService.getUserById(userId);

      res.json({
        success: true,
        data: user
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();


