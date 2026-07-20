
const AuthService = require('./auth.service');
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

  // Register handler (Admin only)
  async register(req, res, next) {
    try {
      const { name, email, password, role } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Name, email and password are required'
        });
      }

      const createdBy = req.user?.id; // From auth middleware

      const user = await AuthService.register(
        { name, email, password, role },
        createdBy
      );

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
