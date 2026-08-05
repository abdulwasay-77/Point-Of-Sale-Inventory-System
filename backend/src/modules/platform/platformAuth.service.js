const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/db');
const env = require('../../config/env');

class PlatformAuthService {
  generateToken(admin) {
    return jwt.sign(
      {
        platformAdminId: admin.id,
        email: admin.email,
        platform: true,
      },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );
  }

  async login(email, password) {
    const admin = await prisma.basePrisma.platformAdmin.findUnique({ where: { email } });
    if (!admin) {
      throw new Error('Invalid email or password');
    }
    if (!admin.is_active) {
      throw new Error('This platform account is deactivated');
    }
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    const token = this.generateToken(admin);
    return {
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email },
    };
  }
}

module.exports = new PlatformAuthService();
